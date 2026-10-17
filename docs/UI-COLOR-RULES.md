# UI color rules

Applies to new/changed product UI in both themes. Established round50 / ADR0107.

1. Use semantic text/surface tokens. A fill token such as accent/lime/gold is not
   automatically a readable text color. Normal text must meet contrast >=4.5:1.
   Decoration is separate from text; keep profile colors as identity marks.
2. Every selected/active/warning state owns a foreground AND background pair.
   Use shared --contrast-* tokens. Both properties must win over custom inline
   emotion/profile styling. Do not fix only the foreground of a changing surface.
3. User colors used for text go through domain/accessible-color.ts readableColor
   against the exact resolved backdrop. Preserve passing colors; adjust only the
   display color when it fails. Never overwrite the stored user color.
4. For alpha overlays, composite onto the intended surface before resolving.
   When text can cross two surfaces, validate against both. Custom emotion paint
   returns the exact precomposited background, not an approximation.
5. Subscribe to the shared theme source in ui/color-theme.ts. Do not create a DOM
   scanner or per-word theme observer. Surface constants must match CSS tokens;
   the parity test fails if they diverge.
6. Keep compact overview stripes intentionally glyph-free. Do not force invisible
   text visible or use opacity on a whole label to solve its color contrast.
7. Validate a color change with npm test, npm run typecheck and npm run build in
   apps/web. The default test run includes color math, theme/pair/cascade tests
   and the product TSX dynamic-foreground guard. Do not add exceptions to hide a
   failed contrast assertion. Run rendered checks for actual affected states.

The guard detects direct dynamic JSX foregrounds and follows local aliases /
resolvers; it is not a complete data-flow or arbitrary CSS-state verifier. Test
new reusable states in styles/contrast-policy.test.mjs so future widgets inherit
the rule. Browser/native controls, overlapping artwork, gradients and all possible
hover/focus arrangements require their own rendered checks before claiming full
accessibility acceptance.

Reference: [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
