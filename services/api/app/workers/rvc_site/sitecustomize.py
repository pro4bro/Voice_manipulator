"""Loaded by every Python process of an RVC training run, through PYTHONPATH.

Applio's trainer always opens a torch process group, even for one GPU. On
Windows that group is gloo, and gloo builds its network device from the
machine's host name. When that name resolves only to IPv6 link-local
addresses - as it does on this machine - gloo refuses ("unsupported gloo
device") and training never starts.

One GPU needs no network: nothing is ever sent between processes. So for a
world of one, the group is opened on torch's in-process "fake" backend instead.
Multi-GPU groups are left exactly as Applio asks. The trainer spawns its
worker process, which is why this lives in sitecustomize rather than in a
launcher: a spawned child imports modules again, and must be patched again.
"""

from __future__ import annotations

import importlib.abc
import importlib.util
import os
import sys

TARGET = "torch.distributed.distributed_c10d"


class _SingleProcessGroup(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path, target=None):
        if fullname != TARGET:
            return None
        sys.meta_path.remove(self)
        spec = importlib.util.find_spec(fullname)
        if spec is None or spec.loader is None:
            return spec
        original_exec = spec.loader.exec_module

        def exec_module(module):
            original_exec(module)
            original = module.init_process_group

            def init_process_group(backend=None, init_method=None, timeout=None, world_size=-1, rank=-1, store=None, *args, **kwargs):
                if backend == "gloo" and world_size in (1, -1) and store is None:
                    from torch.testing._internal.distributed.fake_pg import FakeStore

                    options = {"timeout": timeout} if timeout is not None else {}
                    return original(backend="fake", store=FakeStore(), world_size=1, rank=0, **options)
                return original(backend, init_method, timeout, world_size, rank, store, *args, **kwargs)

            module.init_process_group = init_process_group

        spec.loader.exec_module = exec_module
        return spec


if os.name == "nt" and os.environ.get("PRO4BRO_RVC_SINGLE_GPU_GROUP") == "1":
    sys.meta_path.insert(0, _SingleProcessGroup())
