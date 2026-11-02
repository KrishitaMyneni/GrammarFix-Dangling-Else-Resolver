/**
 * PS-04 GrammarFix — Dangling-Else Resolver
 * Module: visualization.js (Person C)
 *
 * Responsibilities:
 * - Implement renderTrees(result) using vanilla JavaScript and SVG.
 * - Display competing parse trees for ambiguous nested if-else statements in #treeBefore.
 * - Display the resolved parse tree (nearest-unmatched-if rule) in #treeAfter.
 * - Highlight "if" nodes in green and "else" nodes in orange.
 * - Draw clear parent-child connections with readable labels.
 * - Support multiple nesting levels and variable tree sizes via a Reingold-Tilford style
 *   bottom-up subtree width layout algorithm.
 * - Handle invalid inputs, syntax errors, and missing DOM/tree data gracefully.
 */

(function (global) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  // Clean white-and-green theme palette with green "if" and orange "else" highlights
  const THEME = {
    bg: "#ffffff",
    cardBg: "#f8fdf9",
    cardBorder: "#cfe8d5",
    headerBg: "#eaf7ed",
    headerText: "#1b4d2e",
    badgeAmbiguousBg: "#fff3e0",
    badgeAmbiguousText: "#b45309",
    badgeAmbiguousBorder: "#f59e0b",
    badgeResolvedBg: "#dcfce7",
    badgeResolvedText: "#15803d",
    badgeResolvedBorder: "#22c55e",
    edgeStroke: "#648b71",
    edgeLabelBg: "#ffffff",
    edgeLabelText: "#3b5e47",
    nodeIfFill: "#16a34a",
    nodeIfStroke: "#14532d",
    nodeIfText: "#ffffff",
    nodeElseFill: "#ea580c",
    nodeElseStroke: "#9a3412",
    nodeElseText: "#ffffff",
    nodeCondFill: "#e0f2fe",
    nodeCondStroke: "#0284c7",
    nodeCondText: "#0c4a6e",
    nodeDefaultFill: "#ffffff",
    nodeDefaultStroke: "#2e6f40",
    nodeDefaultText: "#143620",
    errorBg: "#fef2f2",
    errorBorder: "#f87171",
    errorText: "#991b1b",
    emptyBg: "#f4fbf6",
    emptyBorder: "#bbf7d0",
    emptyText: "#166534"
  };

  const LAYOUT_CONFIG = {
    nodeMinWidth: 64,
    nodeMaxWidth: 160,
    nodeHeight: 38,
    nodeRadius: 10,
    horizontalGap: 26,
    verticalGap: 78,
    paddingX: 36,
    paddingY: 44,
    charWidth: 7.5
  };

  /**
   * Classifies a node label to determine its visual styling and semantic role.
   * @param {string} rawLabel
   * @returns {"if" | "else" | "condition" | "default"}
   */
  function classifyNode(rawLabel) {
    if (typeof rawLabel !== "string") return "default";
    const normalized = rawLabel.trim().toLowerCase();

    if (
      normalized === "if" ||
      normalized.startsWith("if ") ||
      normalized.startsWith("if(") ||
      normalized === "if-stmt" ||
      normalized === "if_stmt" ||
      normalized === "matched_if" ||
      normalized === "unmatched_if"
    ) {
      return "if";
    }

    if (
      normalized === "else" ||
      normalized.startsWith("else ") ||
      normalized === "else-part" ||
      normalized === "else_part" ||
      normalized === "else-branch"
    ) {
      return "else";
    }

    if (
      normalized.startsWith("cond") ||
      (normalized.startsWith("(") && normalized.endsWith(")"))
    ) {
      return "condition";
    }

    return "default";
  }

  /**
   * Safely normalizes an input tree node into a clean structure `{ label, edgeLabel, children }`.
   * Guards against circular references, null children, and primitive values.
   * @param {*} rawNode
   * @param {number} depth
   * @param {Set<*>} visited
   * @returns {Object|null}
   */
  function normalizeTreeNode(rawNode, depth, visited) {
    if (rawNode === null || rawNode === undefined) return null;
    if (depth > 64) {
      return { label: "...", edgeLabel: null, children: [] };
    }

    if (typeof rawNode === "string" || typeof rawNode === "number") {
      return {
        label: String(rawNode),
        edgeLabel: null,
        children: []
      };
    }

    if (typeof rawNode !== "object") return null;

    if (visited.has(rawNode)) {
      return { label: "[cycle]", edgeLabel: null, children: [] };
    }

    const nextVisited = new Set(visited);
    nextVisited.add(rawNode);

    const rawLabel =
      rawNode.label !== undefined && rawNode.label !== null
        ? String(rawNode.label)
        : rawNode.type !== undefined && rawNode.type !== null
        ? String(rawNode.type)
        : rawNode.name !== undefined && rawNode.name !== null
        ? String(rawNode.name)
        : "node";

    const edgeLabel =
      rawNode.edgeLabel !== undefined && rawNode.edgeLabel !== null
        ? String(rawNode.edgeLabel)
        : rawNode.role !== undefined && rawNode.role !== null
        ? String(rawNode.role)
        : null;

    const rawChildren = Array.isArray(rawNode.children) ? rawNode.children : [];
    const children = [];

    for (let i = 0; i < rawChildren.length; i++) {
      const normalizedChild = normalizeTreeNode(
        rawChildren[i],
        depth + 1,
        nextVisited
      );
      if (normalizedChild) {
        children.push(normalizedChild);
      }
    }

    return {
      label: rawLabel.trim() || "node",
      edgeLabel: edgeLabel,
      children: children
    };
  }

  /**
   * Computes pixel width for a single node based on its text label.
   * @param {string} label
   * @returns {number}
   */
  function computeNodeBoxWidth(label) {
    const textLen = String(label || "").length;
    const estimated = Math.ceil(textLen * LAYOUT_CONFIG.charWidth) + 28;
    return Math.max(
      LAYOUT_CONFIG.nodeMinWidth,
      Math.min(LAYOUT_CONFIG.nodeMaxWidth, estimated)
    );
  }

  /**
   * First pass of layout: measures subtree widths bottom-up so no siblings overlap.
   * @param {Object} node
   * @param {number} depth
   * @returns {Object} Measured layout tree node
   */
  function measureSubtree(node, depth) {
    const boxWidth = computeNodeBoxWidth(node.label);
    const measuredChildren = node.children.map(function (child) {
      return measureSubtree(child, depth + 1);
    });

    if (measuredChildren.length === 0) {
      return {
        label: node.label,
        edgeLabel: node.edgeLabel,
        boxWidth: boxWidth,
        boxHeight: LAYOUT_CONFIG.nodeHeight,
        subtreeWidth: boxWidth,
        depth: depth,
        x: 0,
        y: 0,
        children: []
      };
    }

    let childrenTotalWidth = 0;
    for (let i = 0; i < measuredChildren.length; i++) {
      childrenTotalWidth += measuredChildren[i].subtreeWidth;
      if (i > 0) {
        childrenTotalWidth += LAYOUT_CONFIG.horizontalGap;
      }
    }

    const subtreeWidth = Math.max(boxWidth, childrenTotalWidth);

    return {
      label: node.label,
      edgeLabel: node.edgeLabel,
      boxWidth: boxWidth,
      boxHeight: LAYOUT_CONFIG.nodeHeight,
      subtreeWidth: subtreeWidth,
      childrenTotalWidth: childrenTotalWidth,
      depth: depth,
      x: 0,
      y: 0,
      children: measuredChildren
    };
  }

  /**
   * Second pass of layout: assigns (x, y) center coordinates to every node.
   * @param {Object} measuredNode
   * @param {number} leftBound
   * @param {number} topOffset
   * @param {Object} boundsTracker
   */
  function assignCoordinates(measuredNode, leftBound, topOffset, boundsTracker) {
    const centerX = leftBound + measuredNode.subtreeWidth / 2;
    const centerY =
      topOffset +
      measuredNode.depth * (LAYOUT_CONFIG.nodeHeight + LAYOUT_CONFIG.verticalGap) +
      LAYOUT_CONFIG.nodeHeight / 2;

    measuredNode.x = centerX;
    measuredNode.y = centerY;

    const halfW = measuredNode.boxWidth / 2;
    const halfH = measuredNode.boxHeight / 2;

    if (centerX - halfW < boundsTracker.minX) boundsTracker.minX = centerX - halfW;
    if (centerX + halfW > boundsTracker.maxX) boundsTracker.maxX = centerX + halfW;
    if (centerY - halfH < boundsTracker.minY) boundsTracker.minY = centerY - halfH;
    if (centerY + halfH > boundsTracker.maxY) boundsTracker.maxY = centerY + halfH;

    if (measuredNode.children.length === 0) return;

    let childLeft = centerX - measuredNode.childrenTotalWidth / 2;
    for (let i = 0; i < measuredNode.children.length; i++) {
      const child = measuredNode.children[i];
      assignCoordinates(child, childLeft, topOffset, boundsTracker);
      childLeft += child.subtreeWidth + LAYOUT_CONFIG.horizontalGap;
    }
  }

  /**
   * Infers a helpful parent-child edge label if none was explicitly provided on the child node.
   * @param {Object} parentNode
   * @param {Object} childNode
   * @param {number} childIndex
   * @returns {string}
   */
  function resolveEdgeLabel(parentNode, childNode, childIndex) {
    if (childNode.edgeLabel) return childNode.edgeLabel;

    const parentKind = classifyNode(parentNode.label);
    const childKind = classifyNode(childNode.label);

    if (parentKind === "if") {
      if (childKind === "else") return "else-branch";
      if (childKind === "condition" || childIndex === 0) {
        if (parentNode.children.length >= 2 && childIndex === 0 && childKind !== "if") {
          return "cond";
        }
      }
      if (childIndex === 1 && childKind !== "else") {
        return "then";
      }
      if (childIndex === 2 && childKind === "else") {
        return "else";
      }
    }

    if (parentKind === "else" && childIndex === 0) {
      return "body";
    }

    return "";
  }

  /**
   * Creates an SVG element with the given attributes.
   * @param {string} tagName
   * @param {Object} attrs
   * @returns {SVGElement}
   */
  function createSvgElement(tagName, attrs) {
    const el = document.createElementNS(SVG_NS, tagName);
    if (attrs) {
      const keys = Object.keys(attrs);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (attrs[k] !== undefined && attrs[k] !== null) {
          el.setAttribute(k, String(attrs[k]));
        }
      }
    }
    return el;
  }

  /**
   * Truncates a label if it exceeds the maximum character count for inside-node rendering.
   * @param {string} text
   * @param {number} maxChars
   * @returns {string}
   */
  function formatDisplayLabel(text, maxChars) {
    const clean = String(text || "").trim();
    if (clean.length <= maxChars) return clean;
    return clean.slice(0, maxChars - 1) + "…";
  }

  /**
   * Renders a single normalized tree into an SVG element.
   * @param {Object} rawTree
   * @param {Object} options
   * @returns {SVGElement}
   */
  function createTreeSvg(rawTree, options) {
    const opts = options || {};
    const normalized = normalizeTreeNode(rawTree, 0, new Set());
    if (!normalized) {
      return null;
    }

    const measured = measureSubtree(normalized, 0);
    const bounds = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity
    };

    assignCoordinates(
      measured,
      LAYOUT_CONFIG.paddingX,
      LAYOUT_CONFIG.paddingY,
      bounds
    );

    const svgWidth = Math.max(
      260,
      Math.ceil(bounds.maxX + LAYOUT_CONFIG.paddingX)
    );
    const svgHeight = Math.max(
      160,
      Math.ceil(bounds.maxY + LAYOUT_CONFIG.paddingY)
    );

    const svg = createSvgElement("svg", {
      xmlns: SVG_NS,
      viewBox: "0 0 " + svgWidth + " " + svgHeight,
      width: "100%",
      height: svgHeight,
      role: "img",
      "aria-label": opts.ariaLabel || "Parse Tree SVG",
      style:
        "max-width: 100%; height: auto; display: block; margin: 0 auto; background: " +
        THEME.bg +
        "; border-radius: 8px;"
    });

    // Definitions for subtle drop shadow and arrow markers
    const defs = createSvgElement("defs");
    const marker = createSvgElement("marker", {
      id: "arrow-" + (opts.treeId || "default"),
      viewBox: "0 0 10 10",
      refX: "7",
      refY: "5",
      markerWidth: "6",
      markerHeight: "6",
      orient: "auto-start-reverse"
    });
    const arrowPath = createSvgElement("path", {
      d: "M 0 1.5 L 8 5 L 0 8.5 z",
      fill: THEME.edgeStroke
    });
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const edgesGroup = createSvgElement("g", { class: "tree-edges" });
    const nodesGroup = createSvgElement("g", { class: "tree-nodes" });

    function renderNodeRecursive(node) {
      // Draw edges to children first
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const startX = node.x;
        const startY = node.y + node.boxHeight / 2;
        const endX = child.x;
        const endY = child.y - child.boxHeight / 2 - 3;
        const midY = (startY + endY) / 2;

        const childKind = classifyNode(child.label);
        const isElseEdge = childKind === "else";

        const pathData =
          "M " +
          startX +
          " " +
          startY +
          " C " +
          startX +
          " " +
          midY +
          ", " +
          endX +
          " " +
          midY +
          ", " +
          endX +
          " " +
          endY;

        const edgePath = createSvgElement("path", {
          d: pathData,
          fill: "none",
          stroke: isElseEdge ? THEME.nodeElseFill : THEME.edgeStroke,
          "stroke-width": isElseEdge ? "2.4" : "1.8",
          "stroke-dasharray": isElseEdge && opts.isAmbiguous ? "5,3" : null,
          "marker-end": "url(#arrow-" + (opts.treeId || "default") + ")"
        });
        edgesGroup.appendChild(edgePath);

        const edgeLabelText = resolveEdgeLabel(node, child, i);
        if (edgeLabelText) {
          const labelX = (startX + endX) / 2;
          const labelY = midY - 2;
          const pillW = edgeLabelText.length * 6.2 + 12;
          const pillH = 16;

          const labelBg = createSvgElement("rect", {
            x: labelX - pillW / 2,
            y: labelY - pillH / 2 - 1,
            width: pillW,
            height: pillH,
            rx: 4,
            ry: 4,
            fill: THEME.edgeLabelBg,
            stroke: isElseEdge ? THEME.nodeElseFill : "#d1e7d7",
            "stroke-width": "1"
          });
          edgesGroup.appendChild(labelBg);

          const labelEl = createSvgElement("text", {
            x: labelX,
            y: labelY + 3,
            "text-anchor": "middle",
            "font-family":
              "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            "font-size": "10px",
            "font-weight": "600",
            fill: isElseEdge ? THEME.nodeElseStroke : THEME.edgeLabelText
          });
          labelEl.textContent = edgeLabelText;
          edgesGroup.appendChild(labelEl);
        }

        renderNodeRecursive(child);
      }

      // Draw current node
      const kind = classifyNode(node.label);
      let fill = THEME.nodeDefaultFill;
      let stroke = THEME.nodeDefaultStroke;
      let textColor = THEME.nodeDefaultText;

      if (kind === "if") {
        fill = THEME.nodeIfFill;
        stroke = THEME.nodeIfStroke;
        textColor = THEME.nodeIfText;
      } else if (kind === "else") {
        fill = THEME.nodeElseFill;
        stroke = THEME.nodeElseStroke;
        textColor = THEME.nodeElseText;
      } else if (kind === "condition") {
        fill = THEME.nodeCondFill;
        stroke = THEME.nodeCondStroke;
        textColor = THEME.nodeCondText;
      }

      const nodeG = createSvgElement("g", {
        class: "tree-node tree-node-" + kind,
        "data-node-type": kind,
        "data-node-label": node.label,
        transform: "translate(" + node.x + "," + node.y + ")"
      });

      const titleEl = createSvgElement("title");
      titleEl.textContent = node.label;
      nodeG.appendChild(titleEl);

      const rect = createSvgElement("rect", {
        x: -node.boxWidth / 2,
        y: -node.boxHeight / 2,
        width: node.boxWidth,
        height: node.boxHeight,
        rx: LAYOUT_CONFIG.nodeRadius,
        ry: LAYOUT_CONFIG.nodeRadius,
        fill: fill,
        stroke: stroke,
        "stroke-width": kind === "if" || kind === "else" ? "2.2" : "1.6"
      });
      nodeG.appendChild(rect);

      const text = createSvgElement("text", {
        x: 0,
        y: 4,
        "text-anchor": "middle",
        "font-family":
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        "font-size": "12.5px",
        "font-weight": kind === "if" || kind === "else" ? "700" : "600",
        fill: textColor
      });
      text.textContent = formatDisplayLabel(node.label, 20);
      nodeG.appendChild(text);

      nodesGroup.appendChild(nodeG);
    }

    renderNodeRecursive(measured);

    svg.appendChild(edgesGroup);
    svg.appendChild(nodesGroup);

    return svg;
  }

  /**
   * Builds a legend bar explaining the node color coding.
   * @returns {HTMLElement}
   */
  function createLegendElement() {
    const legend = document.createElement("div");
    legend.className = "tree-legend";
    legend.style.cssText =
      "display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:flex-end;" +
      "padding:8px 12px;margin-bottom:10px;background:#f2fbf4;border:1px solid #cfe8d5;" +
      "border-radius:6px;font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#1b4d2e;";

    const items = [
      { label: "if Node (Green)", color: THEME.nodeIfFill, border: THEME.nodeIfStroke },
      { label: "else Node (Orange)", color: THEME.nodeElseFill, border: THEME.nodeElseStroke },
      { label: "Condition / Statement", color: THEME.nodeDefaultFill, border: THEME.nodeDefaultStroke }
    ];

    for (let i = 0; i < items.length; i++) {
      const item = document.createElement("span");
      item.style.cssText = "display:inline-flex;align-items:center;gap:6px;font-weight:600;";

      const swatch = document.createElement("span");
      swatch.style.cssText =
        "display:inline-block;width:13px;height:13px;border-radius:3px;background:" +
        items[i].color +
        ";border:1.5px solid " +
        items[i].border +
        ";";

      const text = document.createElement("span");
      text.textContent = items[i].label;

      item.appendChild(swatch);
      item.appendChild(text);
      legend.appendChild(item);
    }

    return legend;
  }

  /**
   * Creates an informational or error banner inside a container.
   * @param {string} title
   * @param {string} message
   * @param {"error" | "info"} variant
   * @returns {HTMLElement}
   */
  function createStatusBox(title, message, variant) {
    const isError = variant === "error";
    const box = document.createElement("div");
    box.className = isError ? "tree-status-error" : "tree-status-info";
    box.style.cssText =
      "padding:16px 18px;border-radius:8px;border:1.5px solid " +
      (isError ? THEME.errorBorder : THEME.emptyBorder) +
      ";background:" +
      (isError ? THEME.errorBg : THEME.emptyBg) +
      ";color:" +
      (isError ? THEME.errorText : THEME.emptyText) +
      ";font-family:system-ui,-apple-system,sans-serif;line-height:1.5;";

    const heading = document.createElement("div");
    heading.style.cssText = "font-weight:700;font-size:14px;margin-bottom:4px;";
    heading.textContent = title;

    const body = document.createElement("div");
    body.style.cssText = "font-size:13px;";
    body.textContent = message;

    box.appendChild(heading);
    box.appendChild(body);
    return box;
  }

  /**
   * Wraps an SVG tree in a clean white-and-green card with a descriptive header and badge.
   * @param {SVGElement} svgEl
   * @param {string} title
   * @param {string} subtitle
   * @param {"ambiguous" | "resolved" | "unambiguous"} badgeType
   * @returns {HTMLElement}
   */
  function createTreeCard(svgEl, title, subtitle, badgeType) {
    const card = document.createElement("div");
    card.className = "parse-tree-card";
    card.style.cssText =
      "background:" +
      THEME.cardBg +
      ";border:1.5px solid " +
      THEME.cardBorder +
      ";border-radius:10px;overflow:hidden;box-shadow:0 2px 6px rgba(20,83,45,0.06);" +
      "display:flex;flex-direction:column;flex:1 1 320px;min-width:280px;";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;" +
      "padding:10px 14px;background:" +
      THEME.headerBg +
      ";border-bottom:1px solid " +
      THEME.cardBorder +
      ";font-family:system-ui,-apple-system,sans-serif;";

    const titleWrap = document.createElement("div");
    const titleEl = document.createElement("div");
    titleEl.style.cssText =
      "font-weight:700;font-size:13.5px;color:" + THEME.headerText + ";";
    titleEl.textContent = title;
    titleWrap.appendChild(titleEl);

    if (subtitle) {
      const subEl = document.createElement("div");
      subEl.style.cssText = "font-size:11.5px;color:#3b6e4c;margin-top:2px;";
      subEl.textContent = subtitle;
      titleWrap.appendChild(subEl);
    }

    const badge = document.createElement("span");
    const isAmb = badgeType === "ambiguous";
    badge.style.cssText =
      "font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;border:1px solid " +
      (isAmb ? THEME.badgeAmbiguousBorder : THEME.badgeResolvedBorder) +
      ";background:" +
      (isAmb ? THEME.badgeAmbiguousBg : THEME.badgeResolvedBg) +
      ";color:" +
      (isAmb ? THEME.badgeAmbiguousText : THEME.badgeResolvedText) +
      ";";
    badge.textContent =
      badgeType === "ambiguous"
        ? "Competing Parse"
        : badgeType === "resolved"
        ? "Nearest-Unmatched-If"
        : "Unambiguous Parse";

    header.appendChild(titleWrap);
    header.appendChild(badge);

    const body = document.createElement("div");
    body.style.cssText =
      "padding:12px;overflow-x:auto;background:#ffffff;flex:1;display:flex;align-items:center;justify-content:center;";
    body.appendChild(svgEl);

    card.appendChild(header);
    card.appendChild(body);
    return card;
  }

  /**
   * Main visualization entry point required by PS-04 GrammarFix specification.
   * Renders `result.beforeTrees` into `#treeBefore` and `result.afterTree` into `#treeAfter`.
   *
   * @param {Object} result - Output of analyzeGrammar(code)
   * @returns {boolean} true if trees were rendered, false if an error or invalid state was handled
   */
  function renderTrees(result) {
    if (typeof document === "undefined") {
      return false;
    }

    const beforeContainer = document.getElementById("treeBefore");
    const afterContainer = document.getElementById("treeAfter");

    if (!beforeContainer && !afterContainer) {
      return false;
    }

    if (beforeContainer) beforeContainer.innerHTML = "";
    if (afterContainer) afterContainer.innerHTML = "";

    // Handle null, undefined, or non-object result
    if (!result || typeof result !== "object") {
      if (beforeContainer) {
        beforeContainer.appendChild(
          createStatusBox(
            "No Parse Data Available",
            "Please provide a valid C/Java/JS-style if-else statement to visualize its parse trees.",
            "info"
          )
        );
      }
      if (afterContainer) {
        afterContainer.appendChild(
          createStatusBox(
            "No Resolved Tree Available",
            "Waiting for valid grammar analysis output.",
            "info"
          )
        );
      }
      return false;
    }

    // Handle explicit syntax/grammar error from analyzer
    if (result.error) {
      const errorMsg =
        typeof result.error === "string"
          ? result.error
          : result.error.message || "Invalid if-else syntax detected.";

      if (beforeContainer) {
        beforeContainer.appendChild(
          createStatusBox("Syntax / Grammar Error", errorMsg, "error")
        );
      }
      if (afterContainer) {
        afterContainer.appendChild(
          createStatusBox(
            "Resolution Skipped",
            "Cannot resolve dangling-else ambiguity until syntax errors are fixed: " +
              errorMsg,
            "error"
          )
        );
      }
      return false;
    }

    const beforeTrees = Array.isArray(result.beforeTrees)
      ? result.beforeTrees.filter(Boolean)
      : [];
    const afterTree =
      result.afterTree && typeof result.afterTree === "object"
        ? result.afterTree
        : null;

    let renderedAny = false;

    // Render #treeBefore (competing trees when ambiguous, or single parse tree when unambiguous)
    if (beforeContainer) {
      if (beforeTrees.length === 0) {
        beforeContainer.appendChild(
          createStatusBox(
            "No Competing Parse Trees",
            "No parse trees were returned in beforeTrees.",
            "info"
          )
        );
      } else {
        beforeContainer.appendChild(createLegendElement());

        const grid = document.createElement("div");
        grid.className = "tree-before-grid";
        grid.style.cssText =
          "display:flex;flex-wrap:wrap;gap:16px;align-items:stretch;width:100%;";

        for (let i = 0; i < beforeTrees.length; i++) {
          const svg = createTreeSvg(beforeTrees[i], {
            treeId: "before-" + (i + 1),
            isAmbiguous: Boolean(result.isAmbiguous),
            ariaLabel: "Before Parse Tree " + (i + 1)
          });

          if (svg) {
            let title = "Parse Tree";
            let subtitle = "Unambiguous derivation";
            let badgeType = "unambiguous";

            if (result.isAmbiguous || beforeTrees.length > 1) {
              badgeType = "ambiguous";
              if (i === 0) {
                title = "Interpretation 1 (Inner Association)";
                subtitle = "else attaches to nearest inner if";
              } else if (i === 1) {
                title = "Interpretation 2 (Outer Association)";
                subtitle = "else attaches to outer if (dangling)";
              } else {
                title = "Interpretation " + (i + 1);
                subtitle = "Competing ambiguous derivation";
              }
            }

            grid.appendChild(createTreeCard(svg, title, subtitle, badgeType));
            renderedAny = true;
          }
        }

        if (grid.childNodes.length > 0) {
          beforeContainer.appendChild(grid);
        } else {
          beforeContainer.appendChild(
            createStatusBox(
              "Invalid Tree Structure",
              "Could not render beforeTrees due to malformed node data.",
              "error"
            )
          );
        }
      }
    }

    // Render #treeAfter (resolved parse tree applying nearest-unmatched-if rule)
    if (afterContainer) {
      if (!afterTree) {
        afterContainer.appendChild(
          createStatusBox(
            "No Resolved Parse Tree",
            "No afterTree was provided in the analysis result.",
            "info"
          )
        );
      } else {
        afterContainer.appendChild(createLegendElement());

        const svgAfter = createTreeSvg(afterTree, {
          treeId: "after-resolved",
          isAmbiguous: false,
          ariaLabel: "Resolved Parse Tree"
        });

        if (svgAfter) {
          const explanationText =
            typeof result.explanation === "string" && result.explanation.trim()
              ? result.explanation.trim()
              : "Resolved using the nearest-unmatched-if disambiguation rule.";

          const card = createTreeCard(
            svgAfter,
            "Resolved Parse Tree (Disambiguated)",
            explanationText,
            "resolved"
          );
          afterContainer.appendChild(card);
          renderedAny = true;
        } else {
          afterContainer.appendChild(
            createStatusBox(
              "Invalid Resolved Tree",
              "Could not render afterTree due to malformed node data.",
              "error"
            )
          );
        }
      }
    }

    return renderedAny;
  }

  /**
   * Mock parse tree datasets for standalone visualization testing without grammar.js.
   */
  const MOCK_TREES = {
    ambiguousNestedIfElse: {
      isAmbiguous: true,
      originalGrammar:
        "S -> if (E) S | if (E) S else S | other",
      resolvedGrammar:
        "S -> Matched | Unmatched\nMatched -> if (E) Matched else Matched | other\nUnmatched -> if (E) S | if (E) Matched else Unmatched",
      beforeTrees: [
        {
          label: "if (c1)",
          children: [
            { label: "cond: c1", children: [] },
            {
              label: "if (c2)",
              children: [
                { label: "cond: c2", children: [] },
                { label: "stmt: s1", children: [] },
                {
                  label: "else",
                  children: [{ label: "stmt: s2", children: [] }]
                }
              ]
            }
          ]
        },
        {
          label: "if (c1)",
          children: [
            { label: "cond: c1", children: [] },
            {
              label: "if (c2)",
              children: [
                { label: "cond: c2", children: [] },
                { label: "stmt: s1", children: [] }
              ]
            },
            {
              label: "else",
              children: [{ label: "stmt: s2", children: [] }]
            }
          ]
        }
      ],
      afterTree: {
        label: "if (c1)",
        children: [
          { label: "cond: c1", children: [] },
          {
            label: "if (c2)",
            children: [
              { label: "cond: c2", children: [] },
              { label: "stmt: s1", children: [] },
              {
                label: "else",
                children: [{ label: "stmt: s2", children: [] }]
              }
            ]
          }
        ]
      },
      explanation:
        "Disambiguated by associating 'else s2' with the nearest unmatched inner 'if (c2)'.",
      error: null
    }
  };

  // Expose globally for browser and CommonJS environments
  global.renderTrees = renderTrees;
  global.MOCK_TREES = MOCK_TREES;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      renderTrees: renderTrees,
      createTreeSvg: createTreeSvg,
      classifyNode: classifyNode,
      normalizeTreeNode: normalizeTreeNode,
      MOCK_TREES: MOCK_TREES
    };
  }
})(typeof window !== "undefined" ? window : globalThis);

