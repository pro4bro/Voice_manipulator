cmake_minimum_required(VERSION 3.24)
project(pro4bro_obs_bridge VERSION 0.6.1 LANGUAGES CXX RC)

if(NOT DEFINED OBS_SOURCE_DIR OR NOT DEFINED OBS_IMPORT_LIB_DIR)
  message(FATAL_ERROR "Set OBS_SOURCE_DIR and OBS_IMPORT_LIB_DIR. See README.md.")
endif()

add_library(pro4bro-obs-bridge MODULE src/plugin-main.cpp src/livelink-dialog.cpp src/livelink-mixer.cpp src/livelink-capture.cpp src/brand-logo.rc)
target_compile_features(pro4bro-obs-bridge PRIVATE cxx_std_20)
target_compile_definitions(pro4bro-obs-bridge PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
target_include_directories(pro4bro-obs-bridge PRIVATE
  "${OBS_SOURCE_DIR}/libobs"
  "${OBS_SOURCE_DIR}/frontend/api"
  "${CMAKE_CURRENT_BINARY_DIR}/generated"
)

file(MAKE_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/generated")
file(WRITE "${CMAKE_CURRENT_BINARY_DIR}/generated/obsconfig.h"
  "#pragma once\n#define OBS_RELEASE_CANDIDATE 0\n#define OBS_BETA 0\n")

target_link_directories(pro4bro-obs-bridge PRIVATE "${OBS_IMPORT_LIB_DIR}")
target_link_libraries(pro4bro-obs-bridge PRIVATE obs obs-frontend-api winhttp bcrypt shell32 ole32 comctl32 uxtheme dwmapi)
set_target_properties(pro4bro-obs-bridge PROPERTIES PREFIX "" OUTPUT_NAME "pro4bro-obs-bridge")

if(MSVC)
  target_compile_options(pro4bro-obs-bridge PRIVATE /W4 /permissive- /utf-8)
endif()
