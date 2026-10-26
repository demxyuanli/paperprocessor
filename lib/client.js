/**
 * dsh-paper client half: the right-sidebar audit and tracking panel.
 *
 * Loaded by the DSH web client module loader. It intentionally imports only
 * React from the platform module table; the host API is reached over the
 * same-origin /paper routes.
 */
window.__ModuleLoader__.load({
  id: "@local/dsh-paper",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useCallback = React.useCallback;
    const useMemo = React.useMemo;

    const TYPE_ID = "@local/dsh-paper/audit";
    const KIND = "paper-audit";
    const runtime = { ctx: null };

    const T = {
      labelPrimary: "var(--dsw-alias-label-primary)",
      labelSecondary: "var(--dsw-alias-label-secondary)",
      labelTertiary: "var(--dsw-alias-label-tertiary)",
      labelCaption: "var(--dsw-alias-label-caption)",
      labelInverted: "var(--dsw-alias-label-primary-inverted)",
      bgBase: "var(--dsw-alias-bg-base)",
      bg1: "var(--dsw-alias-bg-layer-1)",
      bg2: "var(--dsw-alias-bg-layer-2)",
      border1: "var(--dsw-alias-border-l1)",
      border2: "var(--dsw-alias-border-l2)",
      hover: "var(--dsw-alias-interactive-bg-hover)",
      info: "var(--dsw-alias-state-business-primary)",
      success: "var(--dsw-alias-state-success-primary)",
      warning: "var(--dsw-alias-state-warn-primary)",
      warnLabel: "var(--dsw-alias-state-warn-label)",
      danger: "var(--dsw-alias-state-error-primary)",
      brand: "var(--dsw-alias-brand-primary)",
      radiusSm: "var(--dsw-radius-sm)",
      radiusMd: "var(--dsw-radius-md)",
      font: "var(--dsw-font-family)",
      mono: "var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
      fontSmall: "var(--dsw-font-xxs-12-font-size, 12px)",
      fontCaption: "var(--dsw-font-xxxs-11-font-size, 11px)",
      fontBody: "var(--dsh-content-font-size-secondary, 13px)",
      lineBody: "var(--dsw-font-xs-13-line-height, 20px)",
    };

    const CSS = [
      ".dsp-root { height: 100%; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 12px 16px 28px; box-sizing: border-box; color: " + T.labelPrimary + "; font-family: " + T.font + "; font-size: " + T.fontBody + "; line-height: " + T.lineBody + "; scrollbar-gutter: stable; }",
      ".dsp-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }",
      ".dsp-title { font-size: 16px; line-height: 24px; font-weight: 600; letter-spacing: -0.01em; }",
      ".dsp-sub { color: " + T.labelTertiary + "; font-size: " + T.fontSmall + "; line-height: 18px; overflow-wrap: anywhere; }",
      ".dsp-stats { display: flex; gap: 8px; margin-bottom: 12px; padding: 1px 1px 5px; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity; }",
      ".dsp-stat { flex: 1 0 100px; min-width: 100px; border: 1px solid " + T.border1 + "; border-top: 2px solid " + T.brand + "; border-radius: 8px; background: " + T.bg1 + "; padding: 7px 9px 8px; scroll-snap-align: start; }",
      ".dsp-stat b { display: block; font-size: 19px; line-height: 23px; font-weight: 700; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".dsp-stat span { display: block; color: " + T.labelTertiary + "; font-size: 10px; line-height: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
      ".dsp-stats::-webkit-scrollbar { height: 4px; }",
      ".dsp-stats::-webkit-scrollbar-thumb { background: " + T.border2 + "; border-radius: 4px; }",
      ".dsp-stats::-webkit-scrollbar-track { background: transparent; }",
      ".dsp-syncbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding: 10px 11px; border: 1px solid color-mix(in srgb, " + T.brand + " 38%, " + T.border1 + "); border-radius: 10px; background: linear-gradient(135deg, color-mix(in srgb, " + T.brand + " 12%, " + T.bg1 + "), color-mix(in srgb, " + T.info + " 7%, " + T.bg1 + ")); box-shadow: 0 5px 16px color-mix(in srgb, " + T.brand + " 10%, transparent); }",
      ".dsp-syncbar-pending { border-color: color-mix(in srgb, " + T.brand + " 58%, " + T.border1 + "); }",
      ".dsp-syncbar-danger { border-color: color-mix(in srgb, " + T.danger + " 55%, " + T.border1 + "); background: linear-gradient(135deg, color-mix(in srgb, " + T.danger + " 10%, " + T.bg1 + "), " + T.bg1 + "); }",
      ".dsp-syncbar-idle { border-color: " + T.border1 + "; background: " + T.bg1 + "; box-shadow: none; }",
      ".dsp-syncbar-icon { width: 30px; height: 30px; border-radius: 8px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, " + T.brand + ", " + T.info + "); color: " + T.labelInverted + "; font-size: 13px; font-weight: 800; box-shadow: 0 0 0 3px color-mix(in srgb, " + T.brand + " 12%, transparent); }",
      ".dsp-syncbar-pending .dsp-syncbar-icon { box-shadow: 0 0 0 4px color-mix(in srgb, " + T.brand + " 18%, transparent); }",
      ".dsp-syncbar-body { flex: 1 1 auto; min-width: 0; }",
      ".dsp-syncbar-title { font-size: " + T.fontSmall + "; line-height: 17px; font-weight: 700; overflow-wrap: anywhere; }",
      ".dsp-syncbar-sub { margin-top: 1px; color: " + T.labelTertiary + "; font-size: " + T.fontCaption + "; line-height: 15px; overflow-wrap: anywhere; }",
      ".dsp-syncbar-actions { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; }",
      ".dsp-syncbar-btn { flex: 0 0 auto; padding: 5px 11px; font-weight: 700; }",
      ".dsp-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }",
      ".dsp-scope { display: flex; gap: 4px; align-items: center; }",
      ".dsp-input { flex: 1 1 auto; min-width: 0; box-sizing: border-box; border: 1px solid " + T.border1 + "; background: " + T.bg1 + "; color: " + T.labelPrimary + "; border-radius: 6px; padding: 5px 9px; font: inherit; font-size: " + T.fontSmall + "; outline: none; }",
      ".dsp-input:focus { border-color: " + T.brand + "; box-shadow: 0 0 0 2px color-mix(in srgb, " + T.brand + " 18%, transparent); }",
      ".dsp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; border: 1px solid " + T.border1 + "; background: " + T.bg1 + "; color: " + T.labelPrimary + "; border-radius: 6px; padding: 3px 8px; font: inherit; font-size: " + T.fontSmall + "; line-height: 18px; cursor: pointer; white-space: nowrap; }",
      ".dsp-btn:hover:not(:disabled) { background: " + T.hover + "; }",
      ".dsp-btn:disabled { opacity: .45; cursor: not-allowed; }",
      ".dsp-btn-primary { background: " + T.brand + "; border-color: " + T.brand + "; color: " + T.labelInverted + "; }",
      ".dsp-btn-primary:hover:not(:disabled) { background: " + T.brand + "; filter: brightness(1.06); }",
      ".dsp-btn-danger { color: " + T.danger + "; border-color: color-mix(in srgb, " + T.danger + " 45%, " + T.border1 + "); }",
      ".dsp-card { border: 1px solid " + T.border1 + "; border-radius: 10px; background: " + T.bg1 + "; margin-bottom: 10px; overflow: hidden; }",
      ".dsp-export-result { display: flex; flex-direction: column; gap: 6px; margin: 0 12px 10px; padding: 8px 10px; border: 1px solid color-mix(in srgb, " + T.success + " 32%, " + T.border1 + "); border-radius: 8px; background: color-mix(in srgb, " + T.success + " 5%, " + T.bg1 + "); }",
      ".dsp-export-result-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }",
      ".dsp-export-result-title { color: " + T.labelPrimary + "; font-size: " + T.fontSmall + "; font-weight: 600; }",
      ".dsp-export-result-dir { color: " + T.labelTertiary + "; font-size: " + T.fontCaption + "; overflow-wrap: anywhere; text-align: right; }",
      ".dsp-family { margin-bottom: 14px; }",
      ".dsp-family-head { display: flex; align-items: center; gap: 8px; margin: 0 2px 6px; }",
      ".dsp-family-title { color: " + T.labelSecondary + "; font-size: " + T.fontSmall + "; font-weight: 600; overflow-wrap: anywhere; }",
      ".dsp-tree { margin-bottom: 14px; }",
      ".dsp-tree-node { position: relative; margin-left: 18px; padding-left: 12px; border-left: 1px solid " + T.border2 + "; }",
      ".dsp-tree-node::before { content: \"\"; position: absolute; left: -1px; top: 20px; width: 10px; height: 1px; background: " + T.border2 + "; }",
      ".dsp-tree-root-node { margin-left: 0; padding-left: 0; border-left: 0; }",
      ".dsp-tree-root-node::before { display: none; }",
      ".dsp-tree-card { display: block; width: 100%; text-align: left; margin: 4px 0; padding: 7px 9px; border: 1px solid " + T.border1 + "; border-radius: 8px; background: " + T.bg1 + "; color: " + T.labelPrimary + "; font: inherit; cursor: pointer; }",
      ".dsp-tree-card:hover { background: " + T.hover + "; border-color: " + T.border2 + "; }",
      ".dsp-tree-main { border-color: " + T.brand + "; background: color-mix(in srgb, " + T.brand + " 6%, " + T.bg1 + "); }",
      ".dsp-tree-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }",
      ".dsp-tree-title { font-size: " + T.fontSmall + "; font-weight: 600; overflow-wrap: anywhere; }",
      ".dsp-tree-meta { color: " + T.labelTertiary + "; font-size: " + T.fontCaption + "; line-height: 15px; margin-top: 2px; }",
      ".dsp-tree-children { margin-left: 2px; }",
      ".dsp-card-branch { margin-left: 14px; border-left: 3px solid color-mix(in srgb, " + T.brand + " 45%, transparent); }",
      ".dsp-card-head { padding: 10px 12px; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; border-bottom: 1px solid " + T.border1 + "; background: " + T.bg2 + "; }",
      ".dsp-card-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }",
      ".dsp-badges { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }",
      ".dsp-badge { border: 1px solid " + T.border2 + "; border-radius: 999px; padding: 0 7px; font-size: " + T.fontCaption + "; line-height: 17px; white-space: nowrap; color: " + T.labelSecondary + "; background: " + T.bg2 + "; }",
      ".dsp-badge-success { color: " + T.success + "; border-color: color-mix(in srgb, " + T.success + " 45%, transparent); background: color-mix(in srgb, " + T.success + " 10%, transparent); }",
      ".dsp-badge-warning { color: " + T.warnLabel + "; border-color: color-mix(in srgb, " + T.warnLabel + " 45%, transparent); background: color-mix(in srgb, " + T.warnLabel + " 10%, transparent); }",
      ".dsp-badge-info { color: " + T.info + "; border-color: color-mix(in srgb, " + T.info + " 45%, transparent); background: color-mix(in srgb, " + T.info + " 10%, transparent); }",
      ".dsp-badge-danger { color: " + T.danger + "; border-color: color-mix(in srgb, " + T.danger + " 45%, transparent); background: color-mix(in srgb, " + T.danger + " 10%, transparent); }",
      ".dsp-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }",
      ".dsp-status-control { display: inline-flex; align-items: center; gap: 5px; }",
      ".dsp-status-select { width: auto; padding: 3px 7px; font-size: " + T.fontSmall + "; }",
      ".dsp-pre { margin: 6px 0 0; max-height: 380px; overflow: auto; background: " + T.bg2 + "; border: 1px solid " + T.border1 + "; border-radius: 8px; padding: 8px 10px; font-family: " + T.mono + "; font-size: " + T.fontSmall + "; line-height: 18px; }",
      ".dsp-diff { margin: 6px 0 2px; border: 1px solid " + T.border1 + "; border-radius: 8px; overflow: hidden; background: " + T.bg2 + "; }",
      ".dsp-diff-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 5px 8px; background: " + T.bg1 + "; border-bottom: 1px solid " + T.border1 + "; }",
      ".dsp-diff-title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }",
      ".dsp-diff-body { max-height: 360px; overflow: auto; padding: 4px 0; font-family: var(--dsw-alias-font-mono, ui-monospace, SFMono-Regular, Consolas, monospace); font-size: 11px; line-height: 16px; }",
      ".dsp-diff-row { display: grid; grid-template-columns: 34px 34px minmax(0, 1fr); gap: 4px; padding: 0 6px; }",
      ".dsp-diff-no { color: " + T.labelCaption + "; text-align: right; user-select: none; font-variant-numeric: tabular-nums; }",
      ".dsp-diff-code { white-space: pre-wrap; overflow-wrap: anywhere; color: " + T.labelPrimary + "; }",
      ".dsp-diff-add { background: color-mix(in srgb, " + T.success + " 9%, transparent); }",
      ".dsp-diff-del { background: color-mix(in srgb, " + T.danger + " 9%, transparent); }",
      ".dsp-diff-hunk { color: " + T.info + "; background: " + T.bg1 + "; padding: 3px 6px; border-top: 1px solid " + T.border1 + "; margin-top: 2px; white-space: pre-wrap; }",
      ".dsp-diff-empty { padding: 10px; color: " + T.labelTertiary + "; font-size: " + T.fontSmall + "; }",
      ".dsp-version-wrap { border-top: 1px dashed " + T.border1 + "; padding: 6px 0; }",
      ".dsp-version-wrap:first-of-type { border-top: none; }",
      ".dsp-version-wrap .dsp-version { border-top: none; padding-top: 0; }",
      ".dsp-version-active { background: color-mix(in srgb, " + T.brand + " 5%, transparent); }",
      ".dsp-notice { border: 1px solid " + T.border1 + "; border-radius: 8px; padding: 7px 10px; margin-bottom: 10px; font-size: " + T.fontSmall + "; line-height: 18px; display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }",
      ".dsp-notice-info { color: " + T.info + "; border-color: color-mix(in srgb, " + T.info + " 35%, transparent); background: color-mix(in srgb, " + T.info + " 8%, transparent); }",
      ".dsp-notice-success { color: " + T.success + "; border-color: color-mix(in srgb, " + T.success + " 35%, transparent); background: color-mix(in srgb, " + T.success + " 8%, transparent); }",
      ".dsp-notice-warning { color: " + T.warnLabel + "; border-color: color-mix(in srgb, " + T.warnLabel + " 35%, transparent); background: color-mix(in srgb, " + T.warnLabel + " 8%, transparent); }",
      ".dsp-notice-danger { color: " + T.danger + "; border-color: color-mix(in srgb, " + T.danger + " 35%, transparent); background: color-mix(in srgb, " + T.danger + " 8%, transparent); }",
      ".dsp-notice .dsp-btn { margin-left: auto; flex: 0 0 auto; }",
      ".dsp-empty { border: 1px dashed " + T.border2 + "; border-radius: 10px; padding: 28px 18px; text-align: center; color: " + T.labelTertiary + "; }",
      ".dsp-version { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 8px; align-items: start; padding: 7px 0; border-top: 1px dashed " + T.border1 + "; }",
      ".dsp-version > .dsp-actions { grid-column: 1 / -1; justify-content: flex-end; }",
      ".dsp-version:first-of-type { border-top: none; }",
      ".dsp-link { background: none; border: none; padding: 0; color: " + T.info + "; cursor: pointer; font: inherit; }",
      ".dsp-graph-wrap { margin-top: 8px; border-top: 1px solid " + T.border1 + "; padding-top: 8px; }",
      ".dsp-graph-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 6px; }",
      ".dsp-graph-scroll { overflow: auto; max-height: 480px; border: 1px solid " + T.border1 + "; border-radius: 8px; background: " + T.bg2 + "; }",
      ".dsp-graph-canvas { position: relative; }",
      ".dsp-graph-row { position: absolute; display: flex; flex-direction: column; gap: 1px; text-align: left; background: transparent; border: 1px solid transparent; border-radius: 6px; padding: 3px 6px; cursor: pointer; color: " + T.labelPrimary + "; font: inherit; overflow: hidden; }",
      ".dsp-graph-row:hover { background: " + T.hover + "; }",
      ".dsp-graph-row-selected { border-color: " + T.brand + "; background: color-mix(in srgb, " + T.brand + " 10%, transparent); }",
      ".dsp-graph-row-top { display: flex; align-items: center; gap: 5px; min-width: 0; }",
      ".dsp-graph-doc { color: " + T.labelTertiary + "; font-size: " + T.fontCaption + "; line-height: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".dsp-graph-date { margin-left: auto; color: " + T.labelCaption + "; font-size: " + T.fontCaption + "; line-height: 14px; white-space: nowrap; }",
      ".dsp-graph-msg { font-size: " + T.fontSmall + "; line-height: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".dsp-graph-sub { color: " + T.labelTertiary + "; font-size: " + T.fontCaption + "; line-height: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".dsp-graph-row .dsp-badge { padding: 0 5px; line-height: 15px; }",
      ".dsp-nowrap { white-space: nowrap; }",
      ".dsp-footer { color: " + T.labelCaption + "; font-size: " + T.fontCaption + "; line-height: 16px; margin-top: 14px; padding-top: 8px; border-top: 1px solid " + T.border1 + "; overflow-wrap: anywhere; }",
      ".dsp-view-switch { display: flex; gap: 2px; padding: 2px; background: " + T.bg2 + "; border: 1px solid " + T.border1 + "; border-radius: 7px; }",
      ".dsp-view-switch .dsp-btn { border: 0; background: transparent; }",
      ".dsp-view-switch .dsp-btn-primary { background: " + T.brand + "; color: " + T.labelInverted + "; }",
      ".dsp-chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-bottom: 10px; }",
      ".dsp-chart-card { border: 1px solid " + T.border1 + "; border-radius: 10px; background: " + T.bg1 + "; padding: 10px 12px; min-width: 0; }",
      ".dsp-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; color: " + T.labelPrimary + "; font-size: " + T.fontSmall + "; font-weight: 600; }",
      ".dsp-bars { display: flex; align-items: flex-end; gap: 3px; height: 84px; }",
      ".dsp-bar-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }",
      ".dsp-bar-wrap { height: 64px; width: 100%; display: flex; align-items: flex-end; }",
      ".dsp-bar { width: 100%; min-height: 2px; background: " + T.brand + "; opacity: .75; border-radius: 3px 3px 0 0; }",
      ".dsp-bar-label { font-size: 9px; line-height: 11px; color: " + T.labelCaption + "; white-space: nowrap; }",
      ".dsp-donut-wrap { display: flex; align-items: center; gap: 12px; }",
      ".dsp-donut { width: 92px; height: 92px; border-radius: 50%; position: relative; flex: 0 0 auto; }",
      ".dsp-donut-hole { position: absolute; inset: 16px; border-radius: 50%; background: " + T.bg1 + "; display: flex; flex-direction: column; align-items: center; justify-content: center; }",
      ".dsp-donut-hole b { font-size: 18px; line-height: 20px; }",
      ".dsp-donut-hole span { font-size: 10px; color: " + T.labelTertiary + "; }",
      ".dsp-legend { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 auto; }",
      ".dsp-legend-row { display: flex; align-items: center; gap: 6px; font-size: " + T.fontSmall + "; color: " + T.labelSecondary + "; }",
      ".dsp-legend-row b { margin-left: auto; color: " + T.labelPrimary + "; font-variant-numeric: tabular-nums; }",
      ".dsp-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex: 0 0 auto; }",
      ".dsp-pipeline { display: flex; flex-direction: column; gap: 6px; }",
      ".dsp-pipeline-row { border: 1px solid transparent; background: transparent; border-radius: 6px; padding: 5px 6px; text-align: left; cursor: pointer; font: inherit; color: " + T.labelPrimary + "; }",
      ".dsp-pipeline-row:hover { background: " + T.hover + "; }",
      ".dsp-pipeline-active { border-color: " + T.brand + "; background: color-mix(in srgb, " + T.brand + " 10%, transparent); }",
      ".dsp-pipeline-top { display: flex; align-items: center; gap: 6px; font-size: " + T.fontSmall + "; margin-bottom: 4px; }",
      ".dsp-pipeline-label { font-weight: 500; }",
      ".dsp-pipeline-count { margin-left: auto; font-variant-numeric: tabular-nums; }",
      ".dsp-pipeline-track { display: block; height: 4px; background: " + T.bg2 + "; border-radius: 2px; overflow: hidden; }",
      ".dsp-pipeline-fill { display: block; height: 100%; border-radius: 2px; min-width: 0; }",
      ".dsp-activity-list { display: flex; flex-direction: column; }",
      ".dsp-activity-row { display: flex; align-items: flex-start; gap: 8px; border: 0; border-top: 1px solid " + T.border1 + "; background: transparent; padding: 6px 0; text-align: left; cursor: pointer; font: inherit; color: " + T.labelPrimary + "; }",
      ".dsp-activity-row:first-child { border-top: 0; }",
      ".dsp-activity-row:hover { background: " + T.hover + "; }",
      ".dsp-activity-dot { width: 6px; height: 6px; border-radius: 50%; background: " + T.brand + "; margin-top: 5px; flex: 0 0 auto; }",
      ".dsp-activity-main { min-width: 0; flex: 1 1 auto; }",
      ".dsp-activity-title { font-size: " + T.fontSmall + "; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".dsp-mini-track { height: 3px; background: " + T.bg2 + "; border-radius: 2px; overflow: hidden; margin-top: 4px; }",
      ".dsp-mini-fill { height: 100%; background: " + T.brand + "; border-radius: 2px; }",
      ".dsp-top-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-top: 1px solid " + T.border1 + "; }",
      ".dsp-top-row:first-of-type { border-top: 0; }",
      ".dsp-top-title { min-width: 0; flex: 1 1 auto; font-size: " + T.fontSmall + "; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".dsp-stage { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }",
      ".dsp-stage-label { font-size: " + T.fontCaption + "; color: " + T.labelTertiary + "; }",
      ".dsp-stage-steps { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }",
      ".dsp-stage-step { border: 1px solid " + T.border1 + "; background: " + T.bg2 + "; color: " + T.labelSecondary + "; border-radius: 999px; padding: 1px 8px; font-size: " + T.fontCaption + "; line-height: 17px; cursor: pointer; font: inherit; }",
      ".dsp-stage-step:hover:not(:disabled) { background: " + T.hover + "; }",
      ".dsp-stage-step:disabled { cursor: default; opacity: .7; }",
      ".dsp-stage-active { background: " + T.brand + "; border-color: " + T.brand + "; color: " + T.labelInverted + "; }",
      ".dsp-stage-arrow { color: " + T.labelCaption + "; font-size: " + T.fontCaption + "; }",
      ".dsp-chip { border: 1px solid " + T.border2 + "; background: " + T.bg2 + "; color: " + T.labelSecondary + "; border-radius: 999px; padding: 1px 8px; font-size: " + T.fontCaption + "; line-height: 17px; cursor: pointer; font: inherit; }",
      ".dsp-chip:hover { background: " + T.hover + "; }",
      ".dsp-progress { margin-top: 8px; }",
      ".dsp-progress-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }",
      ".dsp-progress-track { height: 6px; background: " + T.bg2 + "; border-radius: 3px; overflow: hidden; }",
      ".dsp-progress-fill { height: 100%; background: " + T.brand + "; border-radius: 3px; }",
      ".dsp-next { display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; padding: 5px 8px; border-left: 2px solid " + T.brand + "; background: color-mix(in srgb, " + T.brand + " 7%, transparent); border-radius: 0 6px 6px 0; font-size: " + T.fontSmall + "; line-height: 18px; }",
      ".dsp-next-label { color: " + T.brand + "; font-weight: 600; white-space: nowrap; }",
      ".dsp-check { margin-top: 8px; border: 1px solid " + T.border1 + "; border-radius: 8px; padding: 5px 8px; background: " + T.bg2 + "; }",
      ".dsp-check > summary { cursor: pointer; color: " + T.labelSecondary + "; font-size: " + T.fontSmall + "; }",
      ".dsp-check-list { display: flex; flex-direction: column; gap: 5px; margin-top: 6px; }",
      ".dsp-check-row { display: grid; grid-template-columns: 8px 72px minmax(0, 1fr); gap: 6px; align-items: start; font-size: " + T.fontCaption + "; line-height: 15px; }",
      ".dsp-check-dot { width: 6px; height: 6px; border-radius: 50%; margin-top: 4px; }",
      ".dsp-check-pass { background: " + T.success + "; }",
      ".dsp-check-warn { background: " + T.warnLabel + "; }",
      ".dsp-check-fail { background: " + T.danger + "; }",
      ".dsp-check-label { color: " + T.labelSecondary + "; }",
      ".dsp-brief { margin-top: 8px; border: 1px solid " + T.border1 + "; border-radius: 8px; padding: 5px 8px; background: " + T.bg2 + "; }",
      ".dsp-brief > summary { cursor: pointer; color: " + T.labelSecondary + "; font-size: " + T.fontSmall + "; }",
      ".dsp-brief-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px; margin-top: 6px; }",
      ".dsp-brief-form label { display: flex; flex-direction: column; gap: 2px; font-size: " + T.fontCaption + "; color: " + T.labelTertiary + "; }",
      ".dsp-brief-wide { grid-column: 1 / -1; }",
      ".dsp-brief-input { width: 100%; box-sizing: border-box; }",
      ".dsp-brief-form .dsp-btn { grid-column: 1 / -1; justify-self: start; }",
      ".dsp-menu { position: relative; display: inline-block; }",
      ".dsp-menu > summary { list-style: none; cursor: pointer; }",
      ".dsp-menu > summary::-webkit-details-marker { display: none; }",
      ".dsp-menu[open] > summary { background: " + T.hover + "; }",
      ".dsp-menu-pop { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; padding: 4px; border: 1px solid " + T.border1 + "; border-radius: 6px; background: " + T.bg2 + "; }",
      ".dsp-menu-pop .dsp-btn { border: 0; background: transparent; }",
      ".dsp-menu-pop .dsp-btn:hover:not(:disabled) { background: " + T.hover + "; }",
    ].join("\n");

    function ensureStyle() {
      if (typeof document === "undefined") return;
      if (document.getElementById("dsh-paper-audit-style") !== null) return;
      const style = document.createElement("style");
      style.id = "dsh-paper-audit-style";
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    }

    function encodeSegment(segment) {
      return encodeURIComponent(String(segment)).replace(/%3A/gi, ":");
    }

    function sessionFileAddress(sessionId, filePath) {
      const normalized = String(filePath).replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
      return "dsh-resource://file/session/" + encodeSegment(sessionId) + "/" + normalized.split("/").map(encodeSegment).join("/");
    }

    function versionLabel(version) {
      return "v" + String(version).padStart(6, "0");
    }

    function formatDate(value) {
      if (value === null || value === undefined || value === "") return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    }

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes < 0) return "?";
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    function formatWait(ms) {
      const raw = Number(ms);
      if (!Number.isFinite(raw) || raw < 0) return "刚刚";
      const seconds = Math.max(0, Math.floor(raw / 1000));
      if (seconds < 60) return seconds <= 1 ? "刚刚" : seconds + " 秒";
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return minutes + " 分钟";
      const hours = Math.floor(minutes / 60);
      return hours + " 小时";
    }

    const STAGE_LABELS = { idea: "构思", outline: "提纲", drafting: "初稿", revising: "修订", done: "完成" };
    const STATUS_LABELS = { draft: "草稿", review: "审阅", published: "已发布", archived: "归档" };

    function stageLabel(value) {
      const stage = String(value || "idea").toLowerCase();
      return STAGE_LABELS[stage] || "构思";
    }

    function statusTone(status) {
      const value = String(status || "").toLowerCase();
      if (value === "published") return "success";
      if (value === "review" || value === "reviewing") return "info";
      if (value === "archived") return "neutral";
      return "neutral";
    }

    async function requestJson(url, options) {
      const response = await fetch(url, Object.assign({ cache: "no-store" }, options));
      const text = await response.text();
      let body;
      try {
        body = text === "" ? {} : JSON.parse(text);
      } catch (error) {
        throw new Error("HTTP " + response.status + "（响应不是 JSON）");
      }
      if (!response.ok || body.ok === false) {
        throw new Error(body.message || ("HTTP " + response.status));
      }
      return body;
    }

    function Btn(props) {
      const className = "dsp-btn" + (props.primary ? " dsp-btn-primary" : "") + (props.danger ? " dsp-btn-danger" : "") + (props.className ? " " + props.className : "");
      return h("button", {
        type: "button",
        className: className,
        disabled: props.disabled === true,
        title: props.title,
        onClick: props.onClick,
      }, props.children);
    }

    function Menu(props) {
      return h("details", { className: "dsp-menu" },
        h("summary", { className: "dsp-btn" }, props.label + " ▾"),
        h("div", { className: "dsp-menu-pop" }, props.children)
      );
    }

    function stageTone(value) {
      const stage = String(value || "idea").toLowerCase();
      if (stage === "outline") return T.info;
      if (stage === "drafting") return T.brand;
      if (stage === "revising") return "color-mix(in srgb, " + T.info + " 55%, " + T.success + " 45%)";
      if (stage === "done") return T.success;
      return T.labelTertiary;
    }

    function Badge(props) {
      return h("span", { className: "dsp-badge dsp-badge-" + (props.tone || "neutral"), style: props.style }, props.children);
    }

    function Stat(props) {
      const accent = props.accent || T.brand;
      return h("div", {
        className: "dsp-stat",
        title: String(props.label) + ": " + String(props.value),
        style: { borderTopColor: accent, background: "linear-gradient(180deg, color-mix(in srgb, " + accent + " 7%, " + T.bg1 + "), " + T.bg1 + ")" },
      },
        h("b", { style: { color: accent } }, String(props.value)),
        h("span", null, props.label)
      );
    }

    function lineageText(paper) {
      const parents = paper.lineage && Array.isArray(paper.lineage.parents) ? paper.lineage.parents : [];
      const children = paper.lineage && Array.isArray(paper.lineage.children) ? paper.lineage.children : [];
      const parts = [];
      if (parents.length > 0) parts.push("父: " + parents.map(function (item) { return item.docId + "@" + versionLabel(item.version); }).join(", "));
      if (children.length > 0) parts.push("子: " + children.map(function (item) { return item.docId; }).join(", "));
      return parts.join(" · ");
    }

    const LANE_COLORS = [
      "var(--dsw-alias-brand-primary)",
      "var(--dsw-alias-state-business-primary)",
      "var(--dsw-alias-state-success-primary)",
      "var(--dsw-alias-state-warn-primary)",
      "var(--dsw-alias-state-error-primary)",
      "var(--dsw-alias-label-tertiary)",
    ];

    function parentIdOf(paper) {
      const parents = paper.lineage && Array.isArray(paper.lineage.parents) ? paper.lineage.parents : [];
      return parents.length > 0 && typeof parents[0].docId === "string" ? parents[0].docId : null;
    }

    function isBranchPaper(paper) {
      return parentIdOf(paper) !== null;
    }

    function familyRootId(paper, byId) {
      let current = paper;
      const seen = new Set();
      while (current !== null && current !== undefined) {
        if (seen.has(current.docId)) break;
        seen.add(current.docId);
        const parentId = parentIdOf(current);
        if (parentId === null) return current.docId;
        const parent = byId.get(parentId);
        if (parent === undefined) return current.docId;
        current = parent;
      }
      return paper.docId;
    }

    function familyDepth(paper, byId) {
      let depth = 0;
      let current = paper;
      const seen = new Set();
      while (current !== null && current !== undefined) {
        if (seen.has(current.docId)) break;
        seen.add(current.docId);
        const parentId = parentIdOf(current);
        if (parentId === null) break;
        const parent = byId.get(parentId);
        if (parent === undefined) break;
        depth += 1;
        current = parent;
      }
      return depth;
    }

    /**
     * Group papers into lineage families. A branch without its parent in the
     * current filter becomes a single-member family, so filtering never hides
     * the branch itself.
     */
    function groupFamilies(papers) {
      const byId = new Map();
      for (const paper of papers) byId.set(paper.docId, paper);
      const groups = new Map();
      for (const paper of papers) {
        const rootId = familyRootId(paper, byId);
        if (!groups.has(rootId)) groups.set(rootId, []);
        groups.get(rootId).push({ paper: paper, depth: familyDepth(paper, byId) });
      }
      const families = [];
      for (const [rootId, members] of groups) {
        members.sort(function (left, right) {
          return left.depth - right.depth || String(left.paper.title).localeCompare(String(right.paper.title));
        });
        const root = byId.get(rootId);
        families.push({
          rootId: rootId,
          rootTitle: root !== undefined ? root.title : rootId,
          members: members,
        });
      }
      families.sort(function (left, right) {
        const a = byId.get(left.rootId);
        const b = byId.get(right.rootId);
        return String(b && b.updatedAt ? b.updatedAt : "").localeCompare(String(a && a.updatedAt ? a.updatedAt : ""));
      });
      return families;
    }

    /**
     * Build a paper-level lineage forest: root = mainline, nested children =
     * topic branches. This is intentionally separate from the version DAG.
     */
    function buildLineageForest(papers) {
      const byId = new Map();
      for (const paper of papers) byId.set(paper.docId, paper);
      const families = groupFamilies(papers);
      return families.map(function (family) {
        const nodes = family.members.map(function (member) {
          const parentId = parentIdOf(member.paper);
          const link = member.paper.lineage && Array.isArray(member.paper.lineage.parents) ? member.paper.lineage.parents[0] : null;
          const parentPaper = parentId !== null ? byId.get(parentId) : undefined;
          return {
            paper: member.paper,
            depth: member.depth,
            parentId: parentId,
            parentTitle: parentPaper ? parentPaper.title : parentId,
            parentVersion: link && Number.isInteger(link.version) ? link.version : 0,
            branchedAt: link && typeof link.at === "string" ? link.at : "",
            missingParent: parentId !== null && parentPaper === undefined,
            children: [],
          };
        });
        const nodeById = new Map();
        for (const node of nodes) nodeById.set(node.paper.docId, node);
        const root = nodeById.get(family.rootId) || nodes[0];
        for (const node of nodes) {
          if (node === root) continue;
          const parentNode = node.parentId !== null ? nodeById.get(node.parentId) : undefined;
          if (parentNode) parentNode.children.push(node);
        }
        const sortNodes = function (list) {
          list.sort(function (left, right) {
            return String(left.branchedAt).localeCompare(String(right.branchedAt)) ||
              String(left.paper.title).localeCompare(String(right.paper.title));
          });
        };
        for (const node of nodes) sortNodes(node.children);
        return {
          rootId: family.rootId,
          rootTitle: family.rootTitle,
          root: root,
          nodes: nodes,
          depth: nodes.reduce(function (max, node) { return Math.max(max, node.depth); }, 0),
          branchCount: Math.max(0, nodes.length - 1),
        };
      });
    }

    function PaperAuditBody(props) {
      ensureStyle();
      const api = props || {};
      const info = typeof api.useTabInfo === "function" ? api.useTabInfo() : null;
      const tab = info !== null && info !== undefined && info.tab !== undefined ? info.tab : null;
      const sessionId = tab !== null && typeof tab.sessionId === "string" && tab.sessionId !== ""
        ? tab.sessionId
        : (typeof api.sessionId === "string" && api.sessionId !== "" ? api.sessionId : null);
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(null);
      const [query, setQuery] = useState("");
      const [scope, setScope] = useState("all");
      const [view, setView] = useState("overview");
      const [stageFilter, setStageFilter] = useState("all");
      const [insights, setInsights] = useState({ loading: true, data: null, error: null });
      const [expanded, setExpanded] = useState({});
      const [history, setHistory] = useState({});
      const [historyLoading, setHistoryLoading] = useState({});
      const [diff, setDiff] = useState(null);
      const [graphs, setGraphs] = useState({});
      const [graphOpen, setGraphOpen] = useState({});
      const [graphSelection, setGraphSelection] = useState({ docId: null, nodes: [] });
      const [graphCompare, setGraphCompare] = useState(null);
      const [busy, setBusy] = useState({});
      const [notice, setNotice] = useState(null);
      const [confirmRestore, setConfirmRestore] = useState(null);
      const [watches, setWatches] = useState([]);
      const [syncBusy, setSyncBusy] = useState(false);
      const [exportResult, setExportResult] = useState(null);

      useEffect(function () {
        if (notice === null) return undefined;
        const timer = setTimeout(function () { setNotice(null); }, 9000);
        return function () { clearTimeout(timer); };
      }, [notice]);

      const load = useCallback(async function () {
        if (sessionId === null) {
          setError("无法确定当前会话；请从会话右侧栏打开论文审计。");
          return;
        }
        setLoading(true);
        setError(null);
        setInsights(function (previous) { return Object.assign({}, previous, { loading: true, error: null }); });
        const queryString = "session=" + encodeURIComponent(sessionId);
        const results = await Promise.allSettled([
          requestJson("/paper/list?" + queryString),
          requestJson("/paper/insights?" + queryString + "&days=14"),
          requestJson("/paper/watches?" + queryString),
        ]);
        if (results[0].status === "fulfilled") {
          setData(results[0].value);
        } else {
          setError(String(results[0].reason && results[0].reason.message ? results[0].reason.message : results[0].reason));
        }
        if (results[1].status === "fulfilled") {
          setInsights({ loading: false, data: results[1].value, error: null });
        } else {
          setInsights({ loading: false, data: null, error: String(results[1].reason && results[1].reason.message ? results[1].reason.message : results[1].reason) });
        }
        if (results[2].status === "fulfilled") {
          setWatches(Array.isArray(results[2].value.watches) ? results[2].value.watches : []);
        }
        setLoading(false);
      }, [sessionId]);

      useEffect(function () { load(); }, [load]);

      const refreshWatches = useCallback(async function () {
        if (sessionId === null) return;
        try {
          const value = await requestJson("/paper/watches?session=" + encodeURIComponent(sessionId));
          setWatches(Array.isArray(value.watches) ? value.watches : []);
        } catch {
          // Keep the last known watch state; the next load retries.
        }
      }, [sessionId]);

      useEffect(function () {
        if (sessionId === null) return undefined;
        const timer = setInterval(function () { refreshWatches(); }, 5000);
        return function () { clearInterval(timer); };
      }, [sessionId, refreshWatches]);

      const syncWatch = useCallback(async function (watch) {
        setSyncBusy(true);
        try {
          const value = await requestJson("/paper/action", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sessionId: sessionId,
              action: { type: "syncDocx", watchId: watch.id, message: "Manual sync from overview" },
            }),
          });
          setNotice({ tone: "success", text: "已同步 " + watch.docId + " -> " + versionLabel(value.watch.lastVersion) });
          await load();
        } catch (error) {
          setNotice({ tone: "danger", text: String(error && error.message ? error.message : error) });
        } finally {
          setSyncBusy(false);
        }
      }, [sessionId, load]);

      const papers = data !== null && Array.isArray(data.papers) ? data.papers : [];
      const filtered = useMemo(function () {
        const needle = query.trim().toLowerCase();
        let list = papers;
        if (scope === "main") list = list.filter(function (paper) { return !isBranchPaper(paper); });
        else if (scope === "branches") list = list.filter(isBranchPaper);
        if (stageFilter !== "all") {
          list = list.filter(function (paper) { return String(paper.stage || "idea").toLowerCase() === stageFilter; });
        }
        if (needle === "") return list;
        return list.filter(function (paper) {
          return (String(paper.title) + " " + String(paper.docId)).toLowerCase().indexOf(needle) >= 0;
        });
      }, [papers, query, scope, stageFilter]);

      const families = useMemo(function () { return groupFamilies(filtered); }, [filtered]);

      const stats = useMemo(function () {
        let versions = 0;
        let branches = 0;
        let drift = 0;
        let exports = 0;
        let words = 0;
        let targetWords = 0;
        let active = 0;
        for (const paper of papers) {
          versions += Number(paper.versionCount) || 0;
          words += Number(paper.words) || 0;
          targetWords += Number(paper.targetWords) || 0;
          if (isBranchPaper(paper)) branches += 1;
          if (paper.drift) drift += 1;
          if (String(paper.stage || "idea") !== "done") active += 1;
          exports += Number(paper.exports) || 0;
        }
        return { papers: papers.length, versions: versions, branches: branches, drift: drift, exports: exports, words: words, targetWords: targetWords, active: active };
      }, [papers]);

      const setBusyKey = useCallback(function (key, value) {
        setBusy(function (previous) {
          const next = Object.assign({}, previous);
          next[key] = value;
          return next;
        });
      }, []);

      const loadHistory = useCallback(async function (docId) {
        setHistoryLoading(function (previous) { return Object.assign({}, previous, { [docId]: true }); });
        try {
          const body = await requestJson("/paper/history?session=" + encodeURIComponent(sessionId) + "&doc=" + encodeURIComponent(docId) + "&limit=100");
          setHistory(function (previous) { return Object.assign({}, previous, { [docId]: body }); });
          if (body.adopted === true) load();
        } catch (cause) {
          setNotice({ tone: "danger", text: "读取版本历史失败: " + String(cause && cause.message ? cause.message : cause) });
        } finally {
          setHistoryLoading(function (previous) { return Object.assign({}, previous, { [docId]: false }); });
        }
      }, [sessionId, load]);

      const toggleHistory = useCallback(function (paper) {
        const open = expanded[paper.docId] === true;
        setExpanded(function (previous) { return Object.assign({}, previous, { [paper.docId]: !open }); });
        if (!open) loadHistory(paper.docId);
      }, [expanded, loadHistory]);

      const loadDiff = useCallback(async function (docId, from, to) {
        setDiff({ docId: docId, fromVersion: Number(from), toVersion: Number(to), loading: true, patch: "", from: null, to: null });
        try {
          const body = await requestJson("/paper/diff?session=" + encodeURIComponent(sessionId) + "&doc=" + encodeURIComponent(docId) + "&from=" + encodeURIComponent(String(from)) + "&to=" + encodeURIComponent(String(to)));
          const next = Object.assign({ docId: docId, fromVersion: Number(from), toVersion: Number(to), loading: false }, body);
          setDiff(function (previous) {
            return previous !== null && previous.docId === docId && previous.toVersion === Number(to) ? next : previous;
          });
          if (body.adopted === true) load();
        } catch (cause) {
          const next = { docId: docId, fromVersion: Number(from), toVersion: Number(to), loading: false, error: String(cause && cause.message ? cause.message : cause), patch: "" };
          setDiff(function (previous) {
            return previous !== null && previous.docId === docId && previous.toVersion === Number(to) ? next : previous;
          });
        }
      }, [sessionId, load]);


      const loadGraph = useCallback(async function (docId) {
        setGraphCompare(null);
        setGraphs(function (previous) { return Object.assign({}, previous, { [docId]: { loading: true } }); });
        try {
          const body = await requestJson("/paper/graph?session=" + encodeURIComponent(sessionId) + "&doc=" + encodeURIComponent(docId));
          setGraphs(function (previous) { return Object.assign({}, previous, { [docId]: { loading: false, data: body } }); });
          const own = (body.nodes || []).filter(function (node) { return node.docId === docId; }).sort(function (left, right) { return left.version - right.version; });
          const nodes = own.length >= 2
            ? [own[own.length - 2].id, own[own.length - 1].id]
            : (own.length === 1 ? [own[0].id] : []);
          setGraphSelection({ docId: docId, nodes: nodes });
        } catch (cause) {
          setGraphs(function (previous) { return Object.assign({}, previous, { [docId]: { loading: false, error: String(cause && cause.message ? cause.message : cause) } }); });
        }
      }, [sessionId]);

      const toggleGraph = useCallback(function (paper) {
        const open = graphOpen[paper.docId] === true;
        setGraphOpen(function (previous) { return Object.assign({}, previous, { [paper.docId]: !open }); });
        if (!open) loadGraph(paper.docId);
      }, [graphOpen, loadGraph]);

      const selectGraphNode = useCallback(function (docId, node) {
        setGraphCompare(null);
        setGraphSelection(function (previous) {
          const current = previous.docId === docId ? previous.nodes : [];
          let nodes;
          if (current.indexOf(node.id) >= 0) nodes = current.filter(function (id) { return id !== node.id; });
          else nodes = current.concat(node.id).slice(-2);
          return { docId: docId, nodes: nodes };
        });
      }, []);

      const compareGraph = useCallback(async function (docId) {
        const state = graphs[docId];
        const data = state && state.data;
        if (!data) return;
        const selected = graphSelection.docId === docId
          ? graphSelection.nodes.map(function (id) { return (data.nodes || []).find(function (node) { return node.id === id; }); }).filter(Boolean)
          : [];
        if (selected.length !== 2) return;
        const from = selected[0];
        const to = selected[1];
        setGraphCompare({ docId: docId, loading: true, from: from, to: to });
        try {
          const body = await requestJson("/paper/compare?session=" + encodeURIComponent(sessionId)
            + "&fromDoc=" + encodeURIComponent(from.docId) + "&fromVersion=" + encodeURIComponent(String(from.version))
            + "&toDoc=" + encodeURIComponent(to.docId) + "&toVersion=" + encodeURIComponent(String(to.version)));
          setGraphCompare(Object.assign({ docId: docId, loading: false }, body));
        } catch (cause) {
          setGraphCompare({ docId: docId, loading: false, from: from, to: to, error: String(cause && cause.message ? cause.message : cause) });
        }
      }, [graphs, graphSelection, sessionId]);

      const postAction = useCallback(async function (action) {
        return requestJson("/paper/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId, action: action }),
        });
      }, [sessionId]);

      const doExport = useCallback(async function (paper, formats, version, options) {
        const key = paper.docId + "|export";
        setBusyKey(key, true);
        try {
          const body = await postAction({
            type: "export",
            docId: paper.docId,
            version: version === undefined || version === null ? undefined : String(version.version),
            formats: formats,
            watch: options && options.watch === true ? true : undefined,
            watchSync: options ? options.watchSync : undefined,
            watchIdleSeconds: options ? options.watchIdleSeconds : undefined,
          });
          const ok = (body.files || []).filter(function (file) { return file.ok; }).map(function (file) { return file.format; });
          const failed = (body.files || []).filter(function (file) { return !file.ok; });
          let text = "已导出 " + paper.docId + " " + body.versionId + "： " + (ok.length > 0 ? ok.join(", ") : "无成功格式") + " → " + String(body.dir || "");
          if (body.watch) text += " · 已开启 Word 监听（" + body.watch.syncMode + "）";
          if (failed.length > 0) text += "；失败: " + failed.map(function (file) { return file.format + " " + String(file.error || ""); }).join("; ");
          setNotice({ tone: failed.length > 0 ? "warning" : "success", text: text });
          setExportResult({
            docId: paper.docId,
            versionId: body.versionId,
            dir: body.dir || "",
            files: (body.files || []).filter(function (file) { return file.ok; }).map(function (file) {
              return { format: file.format, path: file.path, bytes: file.bytes };
            }),
            watchPath: body.watch && body.watch.filePath ? body.watch.filePath : "",
            failed: failed.length,
          });
          await load();
        } catch (cause) {
          setNotice({ tone: "danger", text: "导出失败: " + String(cause && cause.message ? cause.message : cause) });
        } finally {
          setBusyKey(key, false);
        }
      }, [postAction, load, setBusyKey]);

      const doSetStage = useCallback(async function (paper, stage) {
        const key = paper.docId + "|stage|" + stage;
        setBusyKey(key, true);
        try {
          const body = await postAction({
            type: "setStage",
            docId: paper.docId,
            stage: stage,
            message: "Move stage to " + stageLabel(stage),
          });
          setNotice({
            tone: "success",
            text: body.changed
              ? ("已将 " + paper.docId + " 推进到「" + stageLabel(stage) + "」（" + body.versionId + "）")
              : (paper.docId + " 已经处于「" + stageLabel(stage) + "」阶段"),
          });
          await load();
          if (graphOpen[paper.docId] === true) await loadGraph(paper.docId);
        } catch (cause) {
          setNotice({ tone: "danger", text: "阶段更新失败: " + String(cause && cause.message ? cause.message : cause) });
        } finally {
          setBusyKey(key, false);
        }
      }, [postAction, load, loadGraph, graphOpen, setBusyKey]);

      const doSetStatus = useCallback(async function (paper, status) {
        const key = paper.docId + "|status";
        setBusyKey(key, true);
        try {
          const body = await postAction({
            type: "setStatus",
            docId: paper.docId,
            status: status,
            message: "Set status to " + status,
          });
          setNotice({
            tone: "success",
            text: body.changed
              ? ("已把 " + paper.docId + " 标记为「" + (STATUS_LABELS[body.status] || body.status) + "」（" + body.versionId + "）")
              : (paper.docId + " 状态已经是「" + (STATUS_LABELS[body.status] || body.status) + "」"),
          });
          await load();
        } catch (cause) {
          setNotice({ tone: "danger", text: "状态更新失败: " + String(cause && cause.message ? cause.message : cause) });
        } finally {
          setBusyKey(key, false);
        }
      }, [postAction, load, setBusyKey]);

      const doAdopt = useCallback(async function (paper) {
        const key = paper.docId + "|adopt";
        setBusyKey(key, true);
        try {
          const body = await postAction({
            type: "adoptExternal",
            docId: paper.docId,
            message: "Adopt external Markdown change",
          });
          setNotice({
            tone: "success",
            text: body.changed
              ? ("已采纳 " + paper.docId + " 的外部改动（" + body.versionId + "）")
              : (paper.docId + " 没有可采纳的外部改动"),
          });
          await load();
        } catch (cause) {
          setNotice({ tone: "danger", text: "采纳外部改动失败: " + String(cause && cause.message ? cause.message : cause) });
        } finally {
          setBusyKey(key, false);
        }
      }, [postAction, load, setBusyKey]);

      const doSetBrief = useCallback(async function (paper, values) {
        const key = paper.docId + "|brief";
        setBusyKey(key, true);
        try {
          const body = await postAction({
            type: "setBrief",
            docId: paper.docId,
            question: values.question,
            targetWords: values.targetWords,
            nextAction: values.nextAction,
            deadline: values.deadline,
            message: "Update writing brief",
          });
          setNotice({
            tone: "success",
            text: body.changed
              ? ("已更新 " + paper.docId + " 的写作简报（" + body.versionId + "）")
              : (paper.docId + " 的写作简报没有变化"),
          });
          await load();
        } catch (cause) {
          setNotice({ tone: "danger", text: "写作简报更新失败: " + String(cause && cause.message ? cause.message : cause) });
        } finally {
          setBusyKey(key, false);
        }
      }, [postAction, load, setBusyKey]);

      const doRestore = useCallback(async function (paper, version) {
        const key = paper.docId + "|restore|" + version.version;
        setConfirmRestore(null);
        setDiff(null);
        setBusyKey(key, true);
        try {
          const body = await postAction({
            type: "restore",
            docId: paper.docId,
            version: String(version.version),
            message: "Restore " + version.id + " from the audit panel",
          });
          setNotice({ tone: "success", text: body.changed ? ("已恢复 " + paper.docId + " 到 " + version.id + "，新版本 " + body.versionId) : ("内容与 " + version.id + " 相同，未生成新版本") });
          await load();
          await loadHistory(paper.docId);
        } catch (cause) {
          setNotice({ tone: "danger", text: "恢复失败: " + String(cause && cause.message ? cause.message : cause) });
        } finally {
          setBusyKey(key, false);
        }
      }, [postAction, load, loadHistory, setBusyKey]);

      const doReview = useCallback(async function (paper) {
        const key = paper.docId + "|review";
        setBusyKey(key, true);
        try {
          const prompt = "请审阅论文《" + paper.title + "》（docId: " + paper.docId + "，当前版本 " + (paper.currentVersion > 0 ? versionLabel(paper.currentVersion) : "unversioned") + "）。" +
            "先用 paper_read({ docId: \"" + paper.docId + "\", brief: true }) 了解结构，再用 paper_history / paper_diff 审计最近演进；" +
            "检查结构、论证、证据与版本差异，给出可执行的修改建议。不要直接改稿，等我确认。";
          const body = await postAction({ type: "startTurn", prompt: prompt });
          setNotice({ tone: "info", text: "已交给 agent（" + String(body.detail || "queued") + "）；切到会话即可看到这一轮。" });
        } catch (cause) {
          setNotice({ tone: "danger", text: "交给 agent 失败: " + String(cause && cause.message ? cause.message : cause) });
        } finally {
          setBusyKey(key, false);
        }
      }, [postAction, setBusyKey]);

      const doBranch = useCallback(async function (paper) {
        const key = paper.docId + "|branch";
        setBusyKey(key, true);
        try {
          const prompt = "我想把论文《" + paper.title + "》（docId: " + paper.docId + "，当前版本 " + (paper.currentVersion > 0 ? versionLabel(paper.currentVersion) : "unversioned") + "）分叉成新的主题论文。" +
            "请先用 paper_read({ docId: \"" + paper.docId + "\", brief: true }) 看目录，然后问我：新论文标题、要保留的章节（编号或标题）、是否包含摘要；" +
            "确认后用 paper_branch 创建一篇独立论文，并在完成后用 paper_export 导出 html/docx/pdf。";
          const body = await postAction({ type: "startTurn", prompt: prompt });
          setNotice({ tone: "info", text: "已把分叉请求交给 agent（" + String(body.detail || "queued") + "）；切到会话继续选择章节。" });
        } catch (cause) {
          setNotice({ tone: "danger", text: "发起分叉失败: " + String(cause && cause.message ? cause.message : cause) });
        } finally {
          setBusyKey(key, false);
        }
      }, [postAction, setBusyKey]);

      const scrollToPaper = useCallback(function (docId) {
        if (typeof document === "undefined") return;
        const element = document.getElementById("paper-card-" + docId);
        if (element !== null && typeof element.scrollIntoView === "function") {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, []);

      const selectStage = useCallback(function (stage) {
        setStageFilter(function (previous) { return previous === stage ? "all" : stage; });
        setView("papers");
      }, []);

      const openPaperRow = useCallback(function (docId) {
        setQuery(docId);
        setScope("all");
        setStageFilter("all");
        setView("papers");
        setTimeout(function () { scrollToPaper(docId); }, 80);
      }, [scrollToPaper]);

      const openFamilyGraph = useCallback(function (docId) {
        setQuery(docId);
        setScope("all");
        setStageFilter("all");
        setView("papers");
        setGraphOpen(function (previous) { return Object.assign({}, previous, { [docId]: true }); });
        loadGraph(docId);
        setTimeout(function () { scrollToPaper(docId); }, 80);
      }, [loadGraph, scrollToPaper]);

      const openPaper = useCallback(function (paper) {
        if (sessionId === null) return;
        const address = sessionFileAddress(sessionId, paper.path);
        try {
          if (tab !== null && tab.actions && typeof tab.actions.openResource === "function") {
            tab.actions.openResource(address);
            return;
          }
          if (runtime.ctx !== null && runtime.ctx.sidebarRight && typeof runtime.ctx.sidebarRight.openResource === "function") {
            runtime.ctx.sidebarRight.openResource(address);
            return;
          }
          setNotice({ tone: "danger", text: "当前环境无法打开文件资源。" });
        } catch (cause) {
          setNotice({ tone: "danger", text: "打开文件失败: " + String(cause && cause.message ? cause.message : cause) });
        }
      }, [sessionId, tab]);

      const renderHistory = function (paper) {
        const loadingHistory = historyLoading[paper.docId] === true;
        const value = history[paper.docId];
        if (loadingHistory) return h("div", { className: "dsp-sub" }, "读取版本历史…");
        if (!value) return null;
        if (value.versions.length === 0) return h("div", { className: "dsp-sub" }, "还没有版本。");
        const pending = confirmRestore !== null && confirmRestore.docId === paper.docId ? confirmRestore.version : null;
        const confirmBar = pending === null ? null : h("div", { className: "dsp-notice dsp-notice-warning" },
          h("span", null, "将 " + paper.docId + " 恢复到 " + pending.id + "，生成一个新版本；历史不会被覆盖。"),
          h("div", { className: "dsp-actions", style: { marginLeft: "auto" } },
            h(Btn, { primary: true, onClick: function () { doRestore(paper, pending); } }, "确认恢复"),
            h(Btn, { onClick: function () { setConfirmRestore(null); } }, "取消")
          )
        );
        return h("div", { style: { borderTop: "1px solid " + T.border1, paddingTop: "8px" } },
          confirmBar,
          h("div", { className: "dsp-sub", style: { marginBottom: "4px" } }, "版本历史 · 当前 " + versionLabel(value.currentVersion)),
          value.versions.map(function (version) {
            const restoreKey = paper.docId + "|restore|" + version.version;
            const diffFor = diff !== null && diff.docId === paper.docId && diff.toVersion === version.version ? diff : null;
            const diffOpen = diffFor !== null && diffFor.loading !== true;
            return h("div", { className: "dsp-version-wrap", key: version.id },
              h("div", { className: "dsp-version" + (diffFor !== null ? " dsp-version-active" : "") },
                h(Badge, { tone: version.source === "external" ? "warning" : "neutral" }, version.id),
                h("div", { style: { minWidth: 0 } },
                  h("div", { style: { fontWeight: 500, overflowWrap: "anywhere" } }, version.message),
                  h("div", { className: "dsp-sub" }, version.source + " · " + formatDate(version.createdAt) + " · " + version.shortSha + " · " + formatBytes(version.bytes))
                ),
                h("div", { className: "dsp-actions" },
                  h(Btn, { key: "export", disabled: busy[paper.docId + "|export"] === true, onClick: function () { doExport(paper, ["html", "docx", "pdf"], version); } }, "导出"),
                  version.previous > 0 ? h(Btn, {
                    key: "diff",
                    disabled: diffFor !== null && diffFor.loading === true,
                    onClick: function () {
                      if (diffOpen) setDiff(null);
                      else loadDiff(paper.docId, version.previous, version.version);
                    },
                  }, diffFor !== null && diffFor.loading === true ? "对比中…" : (diffOpen ? "收起对比" : "对比上一版")) : null,
                  h(Btn, { key: "restore", danger: true, disabled: busy[restoreKey] === true, onClick: function () { setConfirmRestore({ docId: paper.docId, version: version }); } }, "恢复")
                )
              ),
              diffFor !== null ? renderDiffBlock(paper, version, diffFor) : null
            );
          })
        );
      };

      const renderPatchLines = function (patch) {
        let oldLine = 0;
        let newLine = 0;
        return String(patch || "").split("\n").map(function (line, index) {
          if (line.startsWith("@@")) {
            const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
            if (match) {
              oldLine = Number(match[1]);
              newLine = Number(match[2]);
            }
            return h("div", { className: "dsp-diff-hunk", key: index }, line);
          }
          const isHeader = line.startsWith("+++ ") || line.startsWith("--- ");
          const kind = !isHeader && line.startsWith("+") ? "add"
            : !isHeader && line.startsWith("-") ? "del"
            : "ctx";
          const oldLabel = kind === "add" ? "" : String(oldLine++);
          const newLabel = kind === "del" ? "" : String(newLine++);
          return h("div", { className: "dsp-diff-row" + (kind === "add" ? " dsp-diff-add" : (kind === "del" ? " dsp-diff-del" : "")), key: index },
            h("span", { className: "dsp-diff-no" }, oldLabel),
            h("span", { className: "dsp-diff-no" }, newLabel),
            h("span", { className: "dsp-diff-code" }, line === "" ? " " : line)
          );
        });
      };

      const renderDiffBlock = function (paper, version, value) {
        const fromLabel = value.from ? value.from.id : (version.previous > 0 ? versionLabel(version.previous) : "?");
        const toLabel = value.to ? value.to.id : version.id;
        const head = h("div", { className: "dsp-diff-head" },
          h("div", { className: "dsp-diff-title" },
            h(Badge, { tone: "info" }, fromLabel + " → " + toLabel),
            h("span", { className: "dsp-sub" }, value.loading === true
              ? "读取差异…"
              : ("+" + (value.added ?? 0) + " -" + (value.removed ?? 0) + (value.truncated ? " · 已截断" : "")))
          ),
          h("div", { className: "dsp-actions" },
            h(Btn, { onClick: function () { setDiff(null); } }, "关闭")
          )
        );
        if (value.error) {
          return h("div", { className: "dsp-diff" }, head, h("div", { className: "dsp-notice dsp-notice-danger" }, value.error));
        }
        if (value.loading === true) {
          return h("div", { className: "dsp-diff" }, head, h("div", { className: "dsp-diff-empty" }, "加载 diff…"));
        }
        return h("div", { className: "dsp-diff" },
          head,
          value.patch ? h("div", { className: "dsp-diff-body" }, renderPatchLines(value.patch)) : h("div", { className: "dsp-diff-empty" }, "没有文本差异。")
        );
      };


      const renderGraph = function (paper) {
        if (graphOpen[paper.docId] !== true) return null;
        const state = graphs[paper.docId];
        if (!state || state.loading === true) return h("div", { className: "dsp-sub" }, "加载版本图…");
        if (state.error) return h("div", { className: "dsp-notice dsp-notice-danger" }, state.error);
        const data = state.data;
        if (!data || !Array.isArray(data.nodes) || data.nodes.length === 0) {
          return h("div", { className: "dsp-empty" }, "还没有可绘制的版本。");
        }
        // Newest first: initial version at the bottom.
        const nodes = data.nodes.slice().reverse();
        const ROW = 58;
        const TOP = 18;
        const LANE_GAP = 24;
        const LEFT = 24;
        const LABEL_WIDTH = 300;
        const docs = Array.isArray(data.docs) ? data.docs : [];
        const laneOf = new Map();
        docs.forEach(function (doc, index) { laneOf.set(doc.docId, index); });
        const lanes = Math.max(1, docs.length);
        const graphWidth = LEFT * 2 + (lanes - 1) * LANE_GAP;
        const width = graphWidth + LABEL_WIDTH + 16;
        const height = TOP * 2 + nodes.length * ROW;
        const rowIndex = new Map();
        nodes.forEach(function (node, index) { rowIndex.set(node.id, index); });
        const laneX = function (lane) { return LEFT + lane * LANE_GAP; };
        const rowY = function (index) { return TOP + index * ROW + ROW / 2; };
        const laneColor = function (lane) { return LANE_COLORS[Math.abs(lane) % LANE_COLORS.length]; };
        const edges = [];
        for (const edge of data.edges || []) {
          const fromIndex = rowIndex.get(edge.from);
          const toIndex = rowIndex.get(edge.to);
          if (fromIndex === undefined || toIndex === undefined) continue;
          const fromNode = nodes[fromIndex];
          const toNode = nodes[toIndex];
          const fromLane = laneOf.get(fromNode.docId) ?? 0;
          const toLane = laneOf.get(toNode.docId) ?? 0;
          const x1 = laneX(fromLane);
          const y1 = rowY(fromIndex);
          const x2 = laneX(toLane);
          const y2 = rowY(toIndex);
          if (edge.kind === "branch") {
            edges.push(h("path", {
              key: "e-" + edge.kind + "-" + edge.from + "-" + edge.to,
              d: "M " + x1 + " " + y1 + " C " + x1 + " " + ((y1 + y2) / 2) + ", " + x2 + " " + ((y1 + y2) / 2) + ", " + x2 + " " + y2,
              fill: "none",
              stroke: laneColor(toLane),
              strokeWidth: 1.6,
              strokeDasharray: "4 4",
              opacity: 0.85,
            }));
          } else {
            edges.push(h("line", {
              key: "e-" + edge.kind + "-" + edge.from + "-" + edge.to,
              x1: x1,
              y1: y1,
              x2: x2,
              y2: y2,
              stroke: laneColor(fromLane),
              strokeWidth: 1.5,
              opacity: 0.5,
            }));
          }
        }
        const selected = graphSelection.docId === paper.docId ? graphSelection.nodes : [];
        const dots = nodes.map(function (node, index) {
          const lane = laneOf.get(node.docId) ?? 0;
          const selectedIndex = selected.indexOf(node.id);
          const x = laneX(lane);
          const y = rowY(index);
          return h("g", {
            key: "n-" + node.id,
            style: { cursor: "pointer" },
            onClick: function () { selectGraphNode(paper.docId, node); },
          },
            selectedIndex >= 0 ? h("circle", { cx: x, cy: y, r: 9, fill: "none", stroke: T.brand, strokeWidth: 2 }) : null,
            h("circle", { cx: x, cy: y, r: 5.5, fill: laneColor(lane), stroke: T.bg1, strokeWidth: 2 },
              h("title", null, node.docId + " " + node.versionId + " · " + node.message)
            )
          );
        });
        const rows = nodes.map(function (node, index) {
          const selectedIndex = selected.indexOf(node.id);
          const selectedRow = selectedIndex >= 0;
          return h("button", {
            type: "button",
            key: "r-" + node.id,
            className: "dsp-graph-row" + (selectedRow ? " dsp-graph-row-selected" : ""),
            style: {
              left: graphWidth + 8,
              top: TOP + index * ROW,
              width: LABEL_WIDTH - 8,
              height: ROW - 8,
            },
            title: node.message,
            onClick: function () { selectGraphNode(paper.docId, node); },
          },
            h("div", { className: "dsp-graph-row-top" },
              h(Badge, { tone: node.docId === paper.docId ? "info" : "neutral" }, node.versionId),
              h("span", { className: "dsp-graph-doc" }, node.docId),
              selectedRow ? h(Badge, { tone: "success" }, selectedIndex === 0 ? "A" : "B") : null,
              h("span", { className: "dsp-graph-date" }, formatDate(node.createdAt))
            ),
            h("div", { className: "dsp-graph-msg" }, node.message),
            h("div", { className: "dsp-graph-sub" },
              node.source + (node.derivedFrom && node.derivedFrom.docId ? " · from " + node.derivedFrom.docId + "@" + versionLabel(node.derivedFrom.version) : "")
            )
          );
        });
        const compareState = graphCompare !== null && graphCompare.docId === paper.docId ? graphCompare : null;
        const compareBlock = compareState === null ? null
          : compareState.loading === true ? h("div", { className: "dsp-sub" }, "对比中…")
          : compareState.error ? h("div", { className: "dsp-notice dsp-notice-danger" }, compareState.error)
          : h("div", { style: { marginTop: "8px" } },
              h("div", { className: "dsp-actions", style: { marginBottom: "4px" } },
                h("span", { className: "dsp-sub" },
                  "diff " + compareState.from.docId + "@" + compareState.from.versionId + " → " + compareState.to.docId + "@" + compareState.to.versionId +
                  "  (+" + compareState.added + " -" + compareState.removed + ")" + (compareState.truncated ? " · 已截断" : "")
                ),
                h(Btn, { onClick: function () { setGraphCompare(null); } }, "关闭")
              ),
              h("div", { className: "dsp-diff-body" }, renderPatchLines(compareState.patch))
            );
        return h("div", { className: "dsp-graph-wrap" },
          h("div", { className: "dsp-graph-toolbar" },
            h("span", { className: "dsp-sub" }, "新 → 旧 · 最新在上 · " + nodes.length + " 个版本 · " + docs.length + " 个文档"),
            h(Btn, {
              disabled: selected.length !== 2 || (compareState !== null && compareState.loading === true),
              onClick: function () { compareGraph(paper.docId); },
            }, compareState !== null && compareState.loading === true ? "对比中…" : "对比选中两版"),
            h(Btn, {
              disabled: selected.length === 0,
              onClick: function () { setGraphSelection({ docId: paper.docId, nodes: [] }); setGraphCompare(null); },
            }, "清空选择")
          ),
          h("div", { className: "dsp-graph-scroll" },
            h("div", { className: "dsp-graph-canvas", style: { width: width, height: height } },
              h("svg", { width: graphWidth, height: height, style: { position: "absolute", left: 0, top: 0 }, "aria-hidden": "true" }, edges, dots),
              rows
            )
          ),
          compareBlock
        );
      };

      const renderActivity = function (value) {
        const activity = Array.isArray(value.activity) ? value.activity : [];
        const max = Math.max(1, ...activity.map(function (day) { return day.count; }));
        return h("div", { className: "dsp-chart-card" },
          h("div", { className: "dsp-section-head" },
            h("span", null, "版本活动"),
            h("span", { className: "dsp-sub" }, "最近 " + value.days + " 天")
          ),
          h("div", { className: "dsp-bars" },
            activity.map(function (day, index) {
              const height = day.count === 0 ? 2 : Math.max(4, Math.round(day.count / max * 64));
              return h("div", { className: "dsp-bar-col", key: day.date, title: day.date + " · " + day.count + " 个版本" },
                h("div", { className: "dsp-bar-wrap" }, h("div", { className: "dsp-bar", style: { height: height + "px" } })),
                h("span", { className: "dsp-bar-label" }, index % 3 === 0 ? String(day.date || "").slice(5) : "")
              );
            })
          )
        );
      };

      const renderStatusDonut = function (value) {
        const segments = [
          { key: "idea", label: "构思", color: T.labelTertiary },
          { key: "outline", label: "提纲", color: T.info },
          { key: "drafting", label: "初稿", color: T.brand },
          { key: "revising", label: "修订", color: stageTone("revising") },
          { key: "done", label: "完成", color: T.success },
        ];
        const stageCounts = value.stageCounts || {};
        const total = value.totals.papers || 0;
        let cursor = 0;
        const stops = segments.map(function (segment) {
          const count = stageCounts[segment.key] || 0;
          const start = cursor;
          cursor += total > 0 ? count / total * 100 : 0;
          return segment.color + " " + start.toFixed(2) + "% " + cursor.toFixed(2) + "%";
        }).join(", ");
        return h("div", { className: "dsp-chart-card" },
          h("div", { className: "dsp-section-head" }, h("span", null, "阶段分布")),
          h("div", { className: "dsp-donut-wrap" },
            h("div", { className: "dsp-donut", style: { background: total > 0 ? "conic-gradient(" + stops + ")" : T.bg2 } },
              h("div", { className: "dsp-donut-hole" }, h("b", null, String(total)), h("span", null, "论文"))
            ),
            h("div", { className: "dsp-legend" },
              segments.map(function (segment) {
                return h("div", { className: "dsp-legend-row", key: segment.key },
                  h("span", { className: "dsp-dot", style: { background: segment.color } }),
                  h("span", null, segment.label),
                  h("b", null, String(stageCounts[segment.key] || 0))
                );
              })
            )
          )
        );
      };

      const renderPipeline = function (value) {
        const stages = [
          { key: "idea", label: "构思", color: T.labelTertiary },
          { key: "outline", label: "提纲", color: T.info },
          { key: "drafting", label: "初稿", color: T.brand },
          { key: "revising", label: "修订", color: stageTone("revising") },
          { key: "done", label: "完成", color: T.success },
        ];
        const stageCounts = value.stageCounts || {};
        const total = value.totals.papers || 0;
        return h("div", { className: "dsp-chart-card" },
          h("div", { className: "dsp-section-head" },
            h("span", null, "写作流程"),
            h("span", { className: "dsp-sub" }, "点击阶段筛选")
          ),
          h("div", { className: "dsp-pipeline" },
            stages.map(function (stage) {
              const count = stageCounts[stage.key] || 0;
              const pct = total > 0 ? Math.round(count / total * 100) : 0;
              return h("button", {
                type: "button",
                key: stage.key,
                className: "dsp-pipeline-row" + (stageFilter === stage.key ? " dsp-pipeline-active" : ""),
                onClick: function () { selectStage(stage.key); },
              },
                h("span", { className: "dsp-pipeline-top" },
                  h("span", { className: "dsp-dot", style: { background: stage.color } }),
                  h("span", { className: "dsp-pipeline-label" }, stage.label),
                  h("span", { className: "dsp-pipeline-count" }, String(count)),
                  h("span", { className: "dsp-sub" }, pct + "%")
                ),
                h("span", { className: "dsp-pipeline-track" },
                  h("span", { className: "dsp-pipeline-fill", style: { width: pct + "%", background: stage.color } })
                )
              );
            })
          )
        );
      };

      const renderRecent = function (value) {
        const recent = Array.isArray(value.recent) ? value.recent.slice(0, 8) : [];
        return h("div", { className: "dsp-chart-card" },
          h("div", { className: "dsp-section-head" },
            h("span", null, "最近活动"),
            h("span", { className: "dsp-sub" }, "点击定位论文")
          ),
          recent.length === 0
            ? h("div", { className: "dsp-sub" }, "还没有版本活动。")
            : h("div", { className: "dsp-activity-list" },
                recent.map(function (item) {
                  return h("button", {
                    type: "button",
                    key: item.docId + "@" + item.versionId,
                    className: "dsp-activity-row",
                    title: item.message,
                    onClick: function () { openPaperRow(item.docId); },
                  },
                    h("span", { className: "dsp-activity-dot" }),
                    h("div", { className: "dsp-activity-main" },
                      h("div", { className: "dsp-activity-title" }, item.title || item.docId),
                      h("div", { className: "dsp-sub" }, item.docId + " · " + item.versionId + " · " + item.message)
                    ),
                    h("span", { className: "dsp-sub dsp-nowrap" }, formatDate(item.createdAt))
                  );
                })
              )
        );
      };

      const renderDrafting = function (value) {
        const queue = Array.isArray(value.drafting) ? value.drafting.slice(0, 6) : [];
        return h("div", { className: "dsp-chart-card" },
          h("div", { className: "dsp-section-head" },
            h("span", null, "写作队列"),
            h("span", { className: "dsp-sub" }, "未完成 · 按阶段")
          ),
          queue.length === 0
            ? h("div", { className: "dsp-sub" }, "没有进行中的论文。")
            : queue.map(function (paper) {
                const target = Number(paper.targetWords) || 0;
                const progress = paper.progress === null || paper.progress === undefined ? null : paper.progress;
                return h("button", {
                  type: "button",
                  key: paper.docId,
                  className: "dsp-activity-row",
                  onClick: function () { openPaperRow(paper.docId); },
                },
                  h("div", { className: "dsp-activity-main" },
                    h("div", { className: "dsp-activity-title" }, paper.title),
                    h("div", { className: "dsp-sub" },
                      stageLabel(paper.stage) + " · " + paper.words + " 词" + (target > 0 ? " / " + target : "") +
                      (paper.nextAction ? " · 下一步: " + paper.nextAction : "")
                    ),
                    progress !== null
                      ? h("div", { className: "dsp-mini-track" }, h("div", { className: "dsp-mini-fill", style: { width: Math.max(2, progress) + "%" } }))
                      : null
                  ),
                  h("span", { className: "dsp-sub dsp-nowrap" }, paper.deadline ? "截止 " + paper.deadline : paper.score + "/100")
                );
              })
        );
      };

      const renderLineageSummary = function () {
        const forest = buildLineageForest(papers);
        if (forest.length === 0) return null;
        return h("div", { className: "dsp-chart-card" },
          h("div", { className: "dsp-section-head" },
            h("span", null, "论文家谱"),
            h(Btn, { onClick: function () { setView("lineage"); } }, "查看演化树")
          ),
          forest.map(function (family) {
            return h("button", {
              type: "button",
              key: family.rootId,
              className: "dsp-activity-row",
              onClick: function () { setView("lineage"); },
            },
              h("div", { className: "dsp-activity-main" },
                h("div", { className: "dsp-activity-title" }, family.rootTitle),
                h("div", { className: "dsp-sub" }, family.nodes.length + " 篇 · " + family.branchCount + " 分支 · " + family.depth + " 层")
              ),
              h("span", { className: "dsp-sub dsp-nowrap" }, "主线")
            );
          })
        );
      };

      const openWorkspaceFile = useCallback(function (absolutePath) {
        if (sessionId === null || data === null) return;
        const root = String(data.root || "").replace(/\\/g, "/").replace(/\/+$/, "");
        const file = String(absolutePath || "").replace(/\\/g, "/");
        if (root === "" || !file.toLowerCase().startsWith(root.toLowerCase() + "/")) {
          setNotice({ tone: "danger", text: "文件不在当前工作区内，无法直接打开。" });
          return;
        }
        const relative = file.slice(root.length + 1);
        const address = sessionFileAddress(sessionId, relative);
        try {
          if (tab !== null && tab.actions && typeof tab.actions.openResource === "function") {
            tab.actions.openResource(address);
            return;
          }
          if (runtime.ctx !== null && runtime.ctx.sidebarRight && typeof runtime.ctx.sidebarRight.openResource === "function") {
            runtime.ctx.sidebarRight.openResource(address);
            return;
          }
          setNotice({ tone: "danger", text: "当前环境无法打开文件资源。" });
        } catch (cause) {
          setNotice({ tone: "danger", text: "打开文件失败: " + String(cause && cause.message ? cause.message : cause) });
        }
      }, [sessionId, data, tab]);

      const renderSyncBar = function () {
        const list = Array.isArray(watches) ? watches : [];
        const active = list.find(function (watch) {
          return watch.pending === true || watch.status === "pending" || watch.status === "conflict" || watch.status === "error" || watch.status === "importing";
        }) || list[0] || null;
        if (active === null) {
          return h("div", { className: "dsp-syncbar dsp-syncbar-idle" },
            h("div", { className: "dsp-syncbar-icon" }, "W"),
            h("div", { className: "dsp-syncbar-body" },
              h("div", { className: "dsp-syncbar-title" }, "手工同步 Word"),
              h("div", { className: "dsp-syncbar-sub" }, "尚未监听 DOCX；在论文卡片导出时开启 watch 后，可在这里一键同步。")
            ),
            h(Btn, { onClick: function () { setView("papers"); } }, "去论文")
          );
        }
        const paper = papers.find(function (item) { return item.docId === active.docId; });
        const name = paper ? paper.title : active.docId;
        const pending = active.pending === true || active.status === "pending";
        const conflict = active.status === "conflict";
        const failed = active.status === "error";
        const importing = active.status === "importing" || syncBusy;
        const pendingCount = list.filter(function (watch) { return watch.pending === true || watch.status === "pending"; }).length;
        const extra = pendingCount > 1 ? " · 另有 " + (pendingCount - 1) + " 个待同步" : "";
        const syncMode = active.syncMode === "manual" ? "手动检查点" : (active.syncMode === "immediate" ? "每次保存" : "空闲合并");
        let title = "Word 监听中";
        let sub = name + " · 最近 " + (active.lastVersion > 0 ? versionLabel(active.lastVersion) : "—") + " · " + syncMode;
        if (pending) {
          title = "Word 有未同步修改";
          sub = name + " · 已等待 " + formatWait(active.pendingForMs) + " · " + syncMode + extra;
        } else if (conflict) {
          title = "Word 同步冲突";
          sub = name + " · 论文已前进，重新导出最新版后再继续" + (active.lastError ? " · " + active.lastError : "");
        } else if (failed) {
          title = "Word 同步失败";
          sub = name + " · " + (active.lastError || "无法读取 Word 文件");
        }
        const className = "dsp-syncbar" + (pending ? " dsp-syncbar-pending" : "") + (conflict || failed ? " dsp-syncbar-danger" : "");
        return h("div", { className: className },
          h("div", { className: "dsp-syncbar-icon" }, "W"),
          h("div", { className: "dsp-syncbar-body" },
            h("div", { className: "dsp-syncbar-title" }, title),
            h("div", { className: "dsp-syncbar-sub" }, sub)
          ),
          pending
            ? h("div", { className: "dsp-syncbar-actions" },
                h(Btn, { onClick: function () { openWorkspaceFile(active.filePath); } }, "打开"),
                h(Btn, {
                  primary: true,
                  className: "dsp-syncbar-btn",
                  disabled: importing,
                  onClick: function () { syncWatch(active); },
                }, importing ? "同步中…" : "立即同步")
              )
            : (conflict || failed)
              ? h("div", { className: "dsp-syncbar-actions" },
                  h(Btn, { onClick: function () { openWorkspaceFile(active.filePath); } }, "打开"),
                  h(Btn, { onClick: load }, "刷新")
                )
              : h("div", { className: "dsp-syncbar-actions" },
                  h(Btn, { onClick: function () { openWorkspaceFile(active.filePath); } }, "打开"),
                  h("span", { className: "dsp-badge dsp-badge-success" }, "已同步")
                )
        );
      };

      const renderExportResult = function (paper) {
        const result = exportResult !== null && exportResult.docId === paper.docId ? exportResult : null;
        if (result === null) return null;
        const files = result.files.filter(function (file) {
          return !(file.format === "docx" && result.watchPath);
        });
        return h("div", { className: "dsp-export-result" },
          h("div", { className: "dsp-export-result-head" },
            h("span", { className: "dsp-export-result-title" }, "已导出 " + result.versionId + (result.failed > 0 ? " · " + result.failed + " 个失败" : "")),
            h("span", { className: "dsp-export-result-dir" }, result.dir)
          ),
          h("div", { className: "dsp-actions" },
            result.watchPath ? h(Btn, {
              primary: true,
              onClick: function () { openWorkspaceFile(result.watchPath); },
            }, "打开 Word") : null,
            files.map(function (file) {
              return h(Btn, {
                key: file.format,
                onClick: function () { openWorkspaceFile(file.path); },
              }, "打开 " + file.format.toUpperCase());
            }),
            h(Btn, { onClick: function () { setExportResult(null); } }, "关闭")
          )
        );
      };

      const renderOverview = function () {
        if (insights.loading && insights.data === null) return h("div", { className: "dsp-empty" }, "加载概览…");
        if (insights.error && insights.data === null) {
          return h("div", { className: "dsp-notice dsp-notice-danger" },
            h("span", null, insights.error),
            h(Btn, { onClick: load }, "重试")
          );
        }
        const value = insights.data;
        if (value === null) return h("div", { className: "dsp-empty" }, "暂无概览数据。");
        if ((value.totals.papers || 0) === 0) {
          return h("div", { className: "dsp-empty" }, "还没有论文。让 agent 用 paper_new 创建第一篇。");
        }
        return h("div", null,
          renderSyncBar(),
          h("div", { className: "dsp-chart-grid" }, renderActivity(value), renderStatusDonut(value)),
          h("div", { className: "dsp-chart-grid" }, renderPipeline(value), renderDrafting(value)),
          renderLineageSummary(),
          renderRecent(value)
        );
      };

      const renderLineage = function () {
        const forest = buildLineageForest(papers);
        if (forest.length === 0) {
          return h("div", { className: "dsp-empty" }, "还没有论文家族。创建论文或用 paper_branch 分叉后，这里会显示主线与分支关系。");
        }
        const renderNode = function (node, depth) {
          const paper = node.paper;
          const origin = isBranchPaper(paper);
          const label = depth === 0 ? (origin || node.missingParent ? "孤立分支" : "主线") : (depth > 1 ? "子分支" : "分支");
          const parentLine = depth === 0
            ? (origin || node.missingParent ? "父论文不在当前工作区" : "主线起点")
            : ("从 " + (node.parentTitle || node.parentId || "?") + "@" + (node.parentVersion > 0 ? versionLabel(node.parentVersion) : "current") +
              " 分出" + (node.branchedAt ? " · " + formatDate(node.branchedAt) : "") + (node.missingParent ? " · 父论文缺失" : ""));
          return h("div", { className: "dsp-tree-node" + (depth === 0 ? " dsp-tree-root-node" : ""), key: paper.docId },
            h("div", {
              className: "dsp-tree-card" + (depth === 0 ? " dsp-tree-main" : ""),
              role: "button",
              tabIndex: 0,
              title: "查看 " + paper.title,
              onClick: function () { openPaperRow(paper.docId); },
              onKeyDown: function (event) {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openPaperRow(paper.docId);
                }
              },
            },
              h("div", { className: "dsp-tree-head" },
                h("span", { className: "dsp-tree-title" }, paper.title),
                h(Badge, { tone: depth === 0 && !origin && !node.missingParent ? "success" : "info" }, label),
                paper.drift ? h(Badge, { tone: "warning" }, "DRIFT") : null
              ),
              h("div", { className: "dsp-tree-meta" },
                paper.docId + " · " + stageLabel(paper.stage) + " · " + paper.versionCount + " 版本 · " + paper.words + " 词" +
                (paper.currentVersion > 0 ? " · " + versionLabel(paper.currentVersion) : "")
              ),
              h("div", { className: "dsp-tree-meta" }, parentLine),
              node.children.length > 0 ? h("div", { className: "dsp-tree-meta" }, "直接分支 " + node.children.length + " 个") : null
            ),
            node.children.length > 0
              ? h("div", { className: "dsp-tree-children" }, node.children.map(function (child) { return renderNode(child, depth + 1); }))
              : null
          );
        };
        return h("div", null,
          forest.map(function (family) {
            return h("div", { className: "dsp-tree", key: family.rootId },
              h("div", { className: "dsp-family-head" },
                h("span", { className: "dsp-family-title" }, "家谱 · " + family.rootTitle),
                h("span", { className: "dsp-sub" }, family.nodes.length + " 篇 · " + family.branchCount + " 分支 · " + family.depth + " 层"),
                h(Btn, { onClick: function () { openFamilyGraph(family.rootId); } }, "全家版本图")
              ),
              renderNode(family.root, 0)
            );
          })
        );
      };

      const renderPaper = function (paper) {
        const open = expanded[paper.docId] === true;
        const exportBusy = busy[paper.docId + "|export"] === true;
        const reviewBusy = busy[paper.docId + "|review"] === true;
        const branchBusy = busy[paper.docId + "|branch"] === true;
        const graphVisible = graphOpen[paper.docId] === true;
        const currentStage = String(paper.stage || "idea").toLowerCase();
        const draft = paper.draft || null;
        const targetWords = Number(paper.targetWords) || (draft ? draft.targetWords : 0) || 0;
        const progress = draft && draft.progress !== null && draft.progress !== undefined
          ? draft.progress
          : (targetWords > 0 ? Math.min(100, Math.round(Number(paper.words || 0) / targetWords * 100)) : null);
        const nextAction = paper.nextAction || (draft ? draft.nextAction : "") || "";
        const deadline = paper.deadline || (draft ? draft.deadline : "") || "";
        const draftScore = draft ? draft.score : null;
        const lineage = lineageText(paper);
        const branch = isBranchPaper(paper);
        const parentId = parentIdOf(paper);
        return h("div", {
          className: "dsp-card" + (branch ? " dsp-card-branch" : ""),
          key: paper.docId,
          id: "paper-card-" + paper.docId,
        },
          h("div", { className: "dsp-card-head" },
            h("div", { style: { minWidth: 0, flex: "1 1 auto" } },
              h("div", { style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } },
                h("span", { style: { fontWeight: 600, overflowWrap: "anywhere" } }, paper.title),
                branch ? h(Badge, { tone: "info" }, "分支") : null,
                h(Badge, { tone: paper.drift ? "warning" : "success" }, paper.drift ? "DRIFT" : "clean"),
                h(Badge, { tone: "info", style: { color: stageTone(currentStage), borderColor: "color-mix(in srgb, " + stageTone(currentStage) + " 45%, transparent)", background: "color-mix(in srgb, " + stageTone(currentStage) + " 10%, transparent)" } }, stageLabel(currentStage)),
                paper.status && paper.status !== "draft" ? h(Badge, { tone: statusTone(paper.status) }, "发布 " + paper.status) : null,
                h(Badge, { tone: "info" }, paper.currentVersion > 0 ? versionLabel(paper.currentVersion) : "unversioned")
              ),
              h("div", { className: "dsp-sub", style: { marginTop: "3px" } },
                paper.docId + " · " + paper.versionCount + " 版本 · " + paper.words + " 词 · " + formatBytes(paper.bytes) +
                (paper.updatedAt ? " · " + formatDate(paper.updatedAt) : "")
              ),
              lineage === "" ? null : h("div", { className: "dsp-sub", style: { marginTop: "2px" } }, lineage),
              paper.latestMessage ? h("div", { className: "dsp-sub", style: { marginTop: "2px" } }, "最新: " + paper.latestMessage) : null
            ),
            h("div", { className: "dsp-actions" },
              h(Btn, { onClick: function () { openPaper(paper); } }, "打开")
            )
          ),
          h("div", { className: "dsp-card-body" },
            h("div", { className: "dsp-stage" },
              h("span", { className: "dsp-stage-label" }, "阶段"),
              h("div", { className: "dsp-stage-steps" },
                [["idea", "构思"], ["outline", "提纲"], ["drafting", "初稿"], ["revising", "修订"], ["done", "完成"]].map(function (stage, index) {
                  const active = currentStage === stage[0];
                  const busyStage = busy[paper.docId + "|stage|" + stage[0]] === true;
                  return h("span", { key: stage[0], style: { display: "inline-flex", alignItems: "center", gap: "2px" } },
                    index > 0 ? h("span", { className: "dsp-stage-arrow" }, "›") : null,
                    h("button", {
                      type: "button",
                      className: "dsp-stage-step" + (active ? " dsp-stage-active" : ""),
                      style: active ? { background: "color-mix(in srgb, " + stageTone(stage[0]) + " 16%, " + T.bg1 + ")", borderColor: stageTone(stage[0]), color: stageTone(stage[0]) } : undefined,
                      disabled: active || busyStage,
                      onClick: function () { doSetStage(paper, stage[0]); },
                    }, stage[1])
                  );
                })
              )
            ),
            targetWords > 0 || progress !== null
              ? h("div", { className: "dsp-progress" },
                  h("div", { className: "dsp-progress-head" },
                    h("span", { className: "dsp-sub" }, "字数进度"),
                    h("span", { className: "dsp-sub" }, String(paper.words || 0) + (targetWords > 0 ? " / " + targetWords : "") + (progress !== null ? " · " + progress + "%" : ""))
                  ),
                  h("div", { className: "dsp-progress-track" },
                    h("div", { className: "dsp-progress-fill", style: { width: (progress === null ? 0 : Math.max(2, progress)) + "%" } })
                  )
                )
              : null,
            nextAction
              ? h("div", { className: "dsp-next" }, h("span", { className: "dsp-next-label" }, "下一步"), h("span", null, nextAction))
              : null,
            deadline ? h("div", { className: "dsp-sub" }, "截止: " + deadline) : null,
            draft
              ? h("details", { className: "dsp-check" },
                  h("summary", null, "写作清单 · " + draftScore + "/100"),
                  h("div", { className: "dsp-check-list" },
                    (draft.checks || []).map(function (check) {
                      return h("div", { className: "dsp-check-row", key: check.id },
                        h("span", { className: "dsp-check-dot dsp-check-" + check.status }),
                        h("span", { className: "dsp-check-label" }, check.label),
                        h("span", { className: "dsp-sub" }, check.detail)
                      );
                    })
                  )
                )
              : null,
            h("details", { className: "dsp-brief" },
              h("summary", null, "写作简报"),
              h("form", {
                className: "dsp-brief-form",
                onSubmit: function (event) {
                  event.preventDefault();
                  const form = event.currentTarget;
                  doSetBrief(paper, {
                    question: form.elements.question.value,
                    targetWords: form.elements.targetWords.value,
                    nextAction: form.elements.nextAction.value,
                    deadline: form.elements.deadline.value,
                  });
                },
              },
                h("label", { className: "dsp-brief-wide" }, "一句话问题",
                  h("input", { className: "dsp-input dsp-brief-input", name: "question", defaultValue: paper.question || "" })
                ),
                h("label", null, "目标字数",
                  h("input", { className: "dsp-input dsp-brief-input", name: "targetWords", type: "number", min: "0", defaultValue: targetWords > 0 ? String(targetWords) : "" })
                ),
                h("label", null, "截止日期",
                  h("input", { className: "dsp-input dsp-brief-input", name: "deadline", type: "date", defaultValue: deadline })
                ),
                h("label", { className: "dsp-brief-wide" }, "下一步",
                  h("input", { className: "dsp-input dsp-brief-input", name: "nextAction", defaultValue: nextAction })
                ),
                h("button", { type: "submit", className: "dsp-btn dsp-btn-primary" }, busy[paper.docId + "|brief"] === true ? "保存中…" : "保存简报")
              )
            ),
            h("div", { className: "dsp-actions" },
              h(Btn, { onClick: function () { toggleHistory(paper); } }, open ? "收起历史" : "版本历史"),
              h(Btn, { onClick: function () { toggleGraph(paper); } }, graphVisible ? "收起版本图" : "版本图"),
              paper.drift ? h(Btn, { danger: true, disabled: busy[paper.docId + "|adopt"] === true, onClick: function () { doAdopt(paper); } }, busy[paper.docId + "|adopt"] === true ? "采纳中…" : "采纳外部") : null,
              h("label", { className: "dsp-status-control", title: "发布状态；写作阶段在卡片上方的阶段步进器里修改" },
                h("span", { className: "dsp-sub" }, "状态"),
                h("select", {
                  className: "dsp-input dsp-status-select",
                  value: paper.status || "draft",
                  disabled: busy[paper.docId + "|status"] === true,
                  onChange: function (event) { doSetStatus(paper, event.target.value); },
                }, ["draft", "review", "published", "archived"].map(function (status) {
                  return h("option", { key: status, value: status }, STATUS_LABELS[status] || status);
                }))
              ),
              h(Menu, { label: "导出" },
                h(Btn, { key: "all", onClick: function () { doExport(paper, ["html", "docx", "pdf"]); } }, "全部"),
                h(Btn, { key: "html", disabled: exportBusy, onClick: function () { doExport(paper, ["html"]); } }, "HTML"),
                h(Btn, { key: "docx", disabled: exportBusy, onClick: function () { doExport(paper, ["docx"]); } }, "DOCX"),
                h(Btn, { key: "watch", disabled: exportBusy, title: "导出 DOCX 并监听 Word 保存；默认手动检查点", onClick: function () { doExport(paper, ["docx"], undefined, { watch: true, watchSync: "manual" }); } }, "DOCX + 监听"),
                h(Btn, { key: "pdf", disabled: exportBusy, onClick: function () { doExport(paper, ["pdf"]); } }, "PDF")
              ),
              h(Menu, { label: "更多" },
                h(Btn, { key: "open", onClick: function () { openPaper(paper); } }, "打开"),
                h(Btn, { key: "branch", disabled: branchBusy, onClick: function () { doBranch(paper); } }, branchBusy ? "提交中…" : "分叉"),
                h(Btn, { key: "review", disabled: reviewBusy, onClick: function () { doReview(paper); } }, reviewBusy ? "提交中…" : "让 Agent 审阅"),
                branch && parentId !== null && scope === "all" ? h(Btn, { key: "parent", onClick: function () { scrollToPaper(parentId); } }, "定位父论文") : null
              )
            ),
            renderExportResult(paper),
            open ? renderHistory(paper) : null,
            graphVisible ? renderGraph(paper) : null
          )
        );
      };

      const renderFamily = function (family) {
        if (family.members.length === 1) return renderPaper(family.members[0].paper);
        return h("div", { className: "dsp-family", key: family.rootId },
          h("div", { className: "dsp-family-head" },
            h("span", { className: "dsp-family-title" }, "论文家族 · " + family.rootTitle),
            h(Badge, { tone: "info" }, family.members.length + " 篇")
          ),
          family.members.map(function (member) { return renderPaper(member.paper); })
        );
      };

      let body;
      if (sessionId === null) {
        body = h("div", { className: "dsp-empty" }, "无法确定当前会话。请从会话右侧栏打开论文审计。");
      } else if (error !== null) {
        body = h("div", { className: "dsp-notice dsp-notice-danger" },
          h("span", null, error),
          h(Btn, { onClick: load }, "重试")
        );
      } else if (data === null) {
        body = h("div", { className: "dsp-empty" }, loading ? "加载论文…" : "暂无数据");
      } else if (view === "overview") {
        body = renderOverview();
      } else if (view === "lineage") {
        body = renderLineage();
      } else if (filtered.length === 0) {
        body = h("div", { className: "dsp-empty" },
          papers.length === 0
            ? "还没有论文。让 agent 用 paper_new 创建第一篇。"
            : (stageFilter !== "all" ? "该阶段没有论文。" : (query.trim() !== "" ? "没有匹配的论文。" : (scope === "branches" ? "还没有分支论文。" : (scope === "main" ? "还没有主线论文。" : "没有匹配的论文。"))))
        );
      } else {
        body = h("div", null, families.map(renderFamily));
      }

      return h("div", { className: "dsp-root" },
        h("div", { className: "dsp-head" },
          h("div", null,
            h("div", { className: "dsp-title" }, view === "overview" ? "写作总览" : (view === "lineage" ? "演化树" : "论文列表")),
            h("div", { className: "dsp-sub" }, view === "overview" ? "阶段、字数与下一步" : (view === "lineage" ? "主线、分支与分叉来源" : "阶段、进度与版本"))
          ),
          h("div", { className: "dsp-actions" },
            h("div", { className: "dsp-view-switch" },
              h(Btn, { primary: view === "overview", onClick: function () { setView("overview"); } }, "概览"),
              h(Btn, { primary: view === "papers", onClick: function () { setView("papers"); } }, "论文"),
              h(Btn, { primary: view === "lineage", onClick: function () { setView("lineage"); } }, "演化树")
            ),
            h(Btn, { disabled: loading, onClick: load }, loading ? "刷新中…" : "刷新")
          )
        ),
        notice === null ? null : h("div", { className: "dsp-notice dsp-notice-" + notice.tone },
          h("span", null, notice.text),
          h(Btn, { onClick: function () { setNotice(null); } }, "关闭")
        ),
        data === null ? null : h("div", { className: "dsp-stats" },
          h(Stat, { value: stats.papers, label: "论文", accent: T.brand }),
          h(Stat, { value: stats.active, label: "进行中", accent: T.info }),
          h(Stat, { value: stats.words, label: "总字数", accent: T.info }),
          h(Stat, { value: stats.targetWords > 0 ? Math.round(stats.words / stats.targetWords * 100) + "%" : "—", label: "目标进度", accent: T.success }),
          h(Stat, { value: stats.versions, label: "版本", accent: T.brand }),
          h(Stat, { value: stats.branches, label: "分支", accent: T.success })
        ),
        data === null || view !== "papers" ? null : h("div", { className: "dsp-toolbar" },
          h("input", {
            className: "dsp-input",
            type: "search",
            value: query,
            placeholder: "搜索标题或 docId",
            "aria-label": "搜索论文",
            onChange: function (event) { setQuery(event.target.value); },
          }),
          h("div", { className: "dsp-scope" },
            [["all", "全部"], ["main", "主线"], ["branches", "分支"]].map(function (item) {
              return h(Btn, {
                key: item[0],
                primary: scope === item[0],
                onClick: function () { setScope(item[0]); },
              }, item[1]);
            })
          ),
          stageFilter !== "all" ? h("button", {
            type: "button",
            className: "dsp-chip",
            onClick: function () { setStageFilter("all"); },
          }, "阶段: " + stageLabel(stageFilter) + " ×") : null,
          h("span", { className: "dsp-sub dsp-nowrap" }, filtered.length + " / " + papers.length)
        ),
        body,
        data === null ? null : h("div", { className: "dsp-footer" }, "工作区: " + String(data.root || "?") + " · " + formatDate(data.generatedAt))
      );
    }

    return {
      name: "@local/dsh-paper",
      inject: ["slots", "sidebarRightTabs", "sidebarRight"],
      __test: { groupFamilies: groupFamilies, buildLineageForest: buildLineageForest, isBranchPaper: isBranchPaper, parentIdOf: parentIdOf },
      apply(ctx) {
        runtime.ctx = ctx;
        ensureStyle();
        ctx.effect(function () {
          return ctx.sidebarRightTabs.register({
            id: TYPE_ID,
            kind: KIND,
            title: function () { return "论文审计"; },
            guide: [{
              id: "paper.audit",
              order: 20,
              title: function () { return "论文审计"; },
              description: function () { return "版本历史、diff、分叉与发布导出"; },
            }],
            keepMounted: true,
          });
        }, "paper: audit tab type");
        ctx.effect(function () {
          return ctx.slots.register({ name: "sidebar.right.pane.tab", key: TYPE_ID }, PaperAuditBody);
        }, "paper: audit tab body");
      },
    };
  },
});