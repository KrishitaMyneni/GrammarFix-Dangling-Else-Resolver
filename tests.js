/**
 * PS-04 GrammarFix — Dangling-Else Resolver
 * Module: tests.js (Person C)
 *
 * Responsibilities:
 * - Implement runTests() with at least 5 core compiler test cases:
 *   1. Simple if-else
 *   2. Nested if-else ambiguity (classic dangling-else)
 *   3. Multiple else clauses
 *   4. Three-level nested if-else
 *   5. Invalid syntax
 * - Verify ambiguity detection, parse-tree output, and correct else association
 *   (nearest-unmatched-if disambiguation rule).
 * - Test SVG visualization rendering with mock tree data and edge cases.
 * - Display PASS/FAIL results and total tests passed in console and optional DOM container.
 */

(function (global) {
  "use strict";

  // Load visualization module when running in Node.js environment
  let vizModule = null;
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    try {
      vizModule = require("./visualization.js");
    } catch (_e) {
      vizModule = null;
    }
  }

  /**
   * Tokenizes an if-else statement into tokens for standalone grammar analysis
   * when Person B's grammar.js is not yet loaded in the environment.
   * @param {string} code
   * @returns {{ tokens: Array<Object>, error: string|null }}
   */
  function tokenizeIfElse(code) {
    if (typeof code !== "string" || !code.trim()) {
      return { tokens: [], error: "Empty or invalid input string." };
    }

    const tokens = [];
    let i = 0;
    const len = code.length;

    while (i < len) {
      const ch = code[i];

      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      if (ch === ";") {
        i++;
        continue;
      }

      if (ch === "(") {
        let depth = 1;
        let start = i + 1;
        i++;
        while (i < len && depth > 0) {
          if (code[i] === "(") depth++;
          else if (code[i] === ")") depth--;
          i++;
        }
        if (depth !== 0) {
          return { tokens: [], error: "Syntax error: Unclosed parenthesis in condition." };
        }
        const condText = code.slice(start, i - 1).trim();
        if (!condText) {
          return { tokens: [], error: "Syntax error: Empty condition '()' in if statement." };
        }
        tokens.push({ type: "COND", value: condText });
        continue;
      }

      if (ch === ")") {
        return { tokens: [], error: "Syntax error: Unexpected closing parenthesis ')'." };
      }

      if (/[a-zA-Z0-9_=<>\!&\+\-\*\/]/.test(ch)) {
        let start = i;
        while (i < len && !/\s|[();]/.test(code[i])) {
          i++;
        }
        const word = code.slice(start, i);
        if (word === "if") {
          tokens.push({ type: "IF", value: "if" });
        } else if (word === "else") {
          tokens.push({ type: "ELSE", value: "else" });
        } else {
          tokens.push({ type: "STMT", value: word });
        }
        continue;
      }

      return {
        tokens: [],
        error: "Syntax error: Unexpected character '" + ch + "'."
      };
    }

    return { tokens: tokens, error: null };
  }

  /**
   * Dynamic chart/backtracking parser that enumerates ALL valid parse trees for a token sequence
   * under the ambiguous grammar:
   *   S -> if (COND) S
   *   S -> if (COND) S else S
   *   S -> STMT
   * Used only as a fallback when Person B's `analyzeGrammar` is not present in global scope.
   *
   * @param {string} code
   * @returns {Object} Analysis result matching the PS-04 interface specification
   */
  function fallbackAnalyzeGrammar(code) {
    const ORIGINAL_GRAMMAR =
      "S -> if (E) S | if (E) S else S | stmt";
    const RESOLVED_GRAMMAR =
      "S -> Matched | Unmatched\n" +
      "Matched -> if (E) Matched else Matched | stmt\n" +
      "Unmatched -> if (E) S | if (E) Matched else Unmatched";

    const lex = tokenizeIfElse(code);
    if (lex.error) {
      return {
        isAmbiguous: false,
        originalGrammar: ORIGINAL_GRAMMAR,
        resolvedGrammar: RESOLVED_GRAMMAR,
        beforeTrees: [],
        afterTree: null,
        explanation: "",
        error: lex.error
      };
    }

    const tokens = lex.tokens;
    if (tokens.length === 0) {
      return {
        isAmbiguous: false,
        originalGrammar: ORIGINAL_GRAMMAR,
        resolvedGrammar: RESOLVED_GRAMMAR,
        beforeTrees: [],
        afterTree: null,
        explanation: "",
        error: "Syntax error: No executable tokens found."
      };
    }

    // Parse all ambiguous derivations of S over token range [start, end)
    const memo = new Map();

    function parseAmbiguousRange(start, end) {
      const key = start + ":" + end;
      if (memo.has(key)) return memo.get(key);

      const trees = [];
      if (start >= end) {
        memo.set(key, trees);
        return trees;
      }

      // Base case: single statement token
      if (end - start === 1 && tokens[start].type === "STMT") {
        trees.push({
          label: tokens[start].value,
          children: []
        });
      }

      // Recursive case: starts with IF + COND
      if (
        end - start >= 3 &&
        tokens[start].type === "IF" &&
        tokens[start + 1].type === "COND"
      ) {
        const condValue = tokens[start + 1].value;

        // Production 1 (with else): if (COND) S1 else S2
        // Try splitting at every ELSE token (inner-first order so tree[0] is nearest-if)
        for (let k = end - 2; k >= start + 3; k--) {
          if (tokens[k].type === "ELSE") {
            const thenTrees = parseAmbiguousRange(start + 2, k);
            const elseTrees = parseAmbiguousRange(k + 1, end);

            for (let t = 0; t < thenTrees.length; t++) {
              for (let e = 0; e < elseTrees.length; e++) {
                trees.push({
                  label: "if",
                  children: [
                    { label: "cond (" + condValue + ")", children: [] },
                    thenTrees[t],
                    {
                      label: "else",
                      children: [elseTrees[e]]
                    }
                  ]
                });
              }
            }
          }
        }

        // Production 2 (without else): if (COND) S1
        const singleThenTrees = parseAmbiguousRange(start + 2, end);
        for (let t = 0; t < singleThenTrees.length; t++) {
          trees.push({
            label: "if",
            children: [
              { label: "cond (" + condValue + ")", children: [] },
              singleThenTrees[t]
            ]
          });
        }
      }

      memo.set(key, trees);
      return trees;
    }

    // Parse using the disambiguated grammar (Matched / Unmatched)
    function parseDisambiguatedRange(start, end, mode) {
      if (start >= end) return null;

      if (mode === "S") {
        return (
          parseDisambiguatedRange(start, end, "MATCHED") ||
          parseDisambiguatedRange(start, end, "UNMATCHED")
        );
      }

      if (mode === "MATCHED") {
        if (end - start === 1 && tokens[start].type === "STMT") {
          return {
            label: tokens[start].value,
            children: []
          };
        }

        if (
          end - start >= 5 &&
          tokens[start].type === "IF" &&
          tokens[start + 1].type === "COND"
        ) {
          const condValue = tokens[start + 1].value;
          for (let k = start + 3; k <= end - 2; k++) {
            if (tokens[k].type === "ELSE") {
              const leftMatched = parseDisambiguatedRange(start + 2, k, "MATCHED");
              const rightMatched = parseDisambiguatedRange(k + 1, end, "MATCHED");
              if (leftMatched && rightMatched) {
                return {
                  label: "if",
                  children: [
                    { label: "cond (" + condValue + ")", children: [] },
                    leftMatched,
                    {
                      label: "else",
                      children: [rightMatched]
                    }
                  ]
                };
              }
            }
          }
        }
        return null;
      }

      if (mode === "UNMATCHED") {
        if (
          end - start >= 3 &&
          tokens[start].type === "IF" &&
          tokens[start + 1].type === "COND"
        ) {
          const condValue = tokens[start + 1].value;

          // Rule: if (E) Matched else Unmatched
          for (let k = start + 3; k <= end - 2; k++) {
            if (tokens[k].type === "ELSE") {
              const leftMatched = parseDisambiguatedRange(start + 2, k, "MATCHED");
              const rightUnmatched = parseDisambiguatedRange(k + 1, end, "UNMATCHED");
              if (leftMatched && rightUnmatched) {
                return {
                  label: "if",
                  children: [
                    { label: "cond (" + condValue + ")", children: [] },
                    leftMatched,
                    {
                      label: "else",
                      children: [rightUnmatched]
                    }
                  ]
                };
              }
            }
          }

          // Rule: if (E) S
          const innerS = parseDisambiguatedRange(start + 2, end, "S");
          if (innerS) {
            return {
              label: "if",
              children: [
                { label: "cond (" + condValue + ")", children: [] },
                innerS
              ]
            };
          }
        }
        return null;
      }

      return null;
    }

    const allTrees = parseAmbiguousRange(0, tokens.length);
    if (allTrees.length === 0) {
      return {
        isAmbiguous: false,
        originalGrammar: ORIGINAL_GRAMMAR,
        resolvedGrammar: RESOLVED_GRAMMAR,
        beforeTrees: [],
        afterTree: null,
        explanation: "",
        error: "Syntax error: Statement does not conform to if-else grammar."
      };
    }

    const resolvedTree = parseDisambiguatedRange(0, tokens.length, "S") || allTrees[0];
    const isAmbiguous = allTrees.length > 1;

    return {
      isAmbiguous: isAmbiguous,
      originalGrammar: ORIGINAL_GRAMMAR,
      resolvedGrammar: RESOLVED_GRAMMAR,
      beforeTrees: isAmbiguous ? allTrees.slice(0, 2) : [allTrees[0]],
      afterTree: resolvedTree,
      explanation: isAmbiguous
        ? "Ambiguity detected (" +
          allTrees.length +
          " derivations). Resolved by pairing each 'else' with the nearest unmatched 'if'."
        : "Statement is unambiguous; only one valid parse tree exists.",
      error: null
    };
  }

  /**
   * Invokes Person B's `analyzeGrammar(code)` if present globally, otherwise falls back
   * to the built-in grammar parser for standalone testing.
   * @param {string} code
   * @returns {Object}
   */
  function executeGrammarAnalysis(code) {
    if (typeof global.analyzeGrammar === "function") {
      return global.analyzeGrammar(code);
    }
    return fallbackAnalyzeGrammar(code);
  }

  /**
   * Helper: classifies a node label as "if", "else", or "other".
   * @param {Object} node
   * @returns {"if" | "else" | "other"}
   */
  function getNodeSemanticKind(node) {
    if (!node || typeof node.label !== "string") return "other";
    const lbl = node.label.trim().toLowerCase();
    if (
      lbl === "if" ||
      lbl.startsWith("if ") ||
      lbl.startsWith("if(") ||
      lbl === "if-stmt" ||
      lbl === "if_stmt" ||
      lbl === "matched" ||
      lbl === "unmatched"
    ) {
      return "if";
    }
    if (
      lbl === "else" ||
      lbl.startsWith("else ") ||
      lbl === "else-part" ||
      lbl === "else_part" ||
      lbl === "else-branch"
    ) {
      return "else";
    }
    return "other";
  }

  /**
   * Helper: counts nodes matching a given semantic kind ("if" or "else") in a tree.
   * @param {Object} tree
   * @param {"if" | "else"} targetKind
   * @returns {number}
   */
  function countNodesOfKind(tree, targetKind) {
    if (!tree || typeof tree !== "object") return 0;
    let count = getNodeSemanticKind(tree) === targetKind ? 1 : 0;
    if (Array.isArray(tree.children)) {
      for (let i = 0; i < tree.children.length; i++) {
        count += countNodesOfKind(tree.children[i], targetKind);
      }
    }
    return count;
  }

  /**
   * Helper: returns an array recording the nesting depth of the `if` ancestor each `else`
   * node is attached to (1 = outermost `if`, 2 = second nested `if`, 3 = third nested `if`, etc.).
   * @param {Object} tree
   * @returns {number[]}
   */
  function getElseAttachmentDepths(tree) {
    const depths = [];

    function walk(node, currentIfDepth) {
      if (!node || typeof node !== "object") return;
      const kind = getNodeSemanticKind(node);
      const nextIfDepth = kind === "if" ? currentIfDepth + 1 : currentIfDepth;

      if (kind === "else") {
        depths.push(currentIfDepth);
      }

      if (Array.isArray(node.children)) {
        for (let i = 0; i < node.children.length; i++) {
          walk(node.children[i], nextIfDepth);
        }
      }
    }

    walk(tree, 0);
    return depths;
  }

  /**
   * Serializes a tree into a canonical bracket string to verify structural distinctness.
   * @param {Object} node
   * @returns {string}
   */
  function serializeTreeStructure(node) {
    if (!node || typeof node !== "object") return "";
    const childrenStr = Array.isArray(node.children)
      ? node.children.map(serializeTreeStructure).join(",")
      : "";
    return String(node.label || "") + "(" + childrenStr + ")";
  }

  /**
   * Defines the test suite covering the 5 required compiler test cases plus visualization checks.
   */
  const TEST_CASES = [
    {
      id: 1,
      name: "Test 1: Simple if-else statement",
      input: "if (c1) s1 else s2",
      verify: function (result) {
        if (!result || result.error) {
          return {
            passed: false,
            reason: "Expected valid analysis without error, got: " + (result && result.error)
          };
        }
        if (result.isAmbiguous !== false) {
          return {
            passed: false,
            reason: "Expected isAmbiguous === false for simple if-else, got " + result.isAmbiguous
          };
        }
        if (!result.afterTree || typeof result.afterTree !== "object") {
          return { passed: false, reason: "Missing afterTree for simple if-else." };
        }
        const ifCount = countNodesOfKind(result.afterTree, "if");
        const elseCount = countNodesOfKind(result.afterTree, "else");
        const attachDepths = getElseAttachmentDepths(result.afterTree);

        if (ifCount < 1 || elseCount < 1) {
          return {
            passed: false,
            reason: "Expected at least 1 'if' node and 1 'else' node in afterTree."
          };
        }
        if (attachDepths[0] !== 1) {
          return {
            passed: false,
            reason: "Expected 'else' to attach to outermost 'if' (depth 1), got depth " + attachDepths[0]
          };
        }
        return {
          passed: true,
          reason: "Unambiguous simple if-else parsed with 'else' bound to 'if' at depth 1."
        };
      }
    },
    {
      id: 2,
      name: "Test 2: Nested if-else ambiguity (classic dangling-else)",
      input: "if (c1) if (c2) s1 else s2",
      verify: function (result) {
        if (!result || result.error) {
          return {
            passed: false,
            reason: "Expected valid analysis for dangling-else input, got error: " + (result && result.error)
          };
        }
        if (result.isAmbiguous !== true) {
          return {
            passed: false,
            reason: "Expected isAmbiguous === true for nested dangling-else."
          };
        }
        if (!Array.isArray(result.beforeTrees) || result.beforeTrees.length < 2) {
          return {
            passed: false,
            reason: "Expected at least 2 competing parse trees in beforeTrees."
          };
        }
        const sig1 = serializeTreeStructure(result.beforeTrees[0]);
        const sig2 = serializeTreeStructure(result.beforeTrees[1]);
        if (sig1 === sig2) {
          return {
            passed: false,
            reason: "Expected the two competing beforeTrees to be structurally distinct."
          };
        }
        if (!result.afterTree) {
          return { passed: false, reason: "Missing resolved afterTree." };
        }
        const resolvedDepths = getElseAttachmentDepths(result.afterTree);
        if (resolvedDepths.length < 1 || resolvedDepths[0] !== 2) {
          return {
            passed: false,
            reason:
              "Nearest-unmatched-if rule violated: expected 'else' at inner 'if' (depth 2), got depth " +
              resolvedDepths[0]
          };
        }
        return {
          passed: true,
          reason:
            "Ambiguity detected (2 distinct beforeTrees) and resolved to nearest inner 'if' (depth 2)."
        };
      }
    },
    {
      id: 3,
      name: "Test 3: Multiple else clauses (fully matched nested if-else)",
      input: "if (c1) if (c2) s1 else s2 else s3",
      verify: function (result) {
        if (!result || result.error) {
          return {
            passed: false,
            reason: "Unexpected error on multiple else clauses: " + (result && result.error)
          };
        }
        if (result.isAmbiguous !== false) {
          return {
            passed: false,
            reason: "Expected isAmbiguous === false when every 'if' has a matching 'else'."
          };
        }
        if (!result.afterTree) {
          return { passed: false, reason: "Missing afterTree for multiple else clauses." };
        }
        const ifCount = countNodesOfKind(result.afterTree, "if");
        const elseCount = countNodesOfKind(result.afterTree, "else");
        const depths = getElseAttachmentDepths(result.afterTree).sort();

        if (ifCount !== 2 || elseCount !== 2) {
          return {
            passed: false,
            reason: "Expected 2 'if' nodes and 2 'else' nodes, got if=" + ifCount + ", else=" + elseCount
          };
        }
        if (depths[0] !== 1 || depths[1] !== 2) {
          return {
            passed: false,
            reason:
              "Expected inner 'else' at depth 2 and outer 'else' at depth 1, got depths [" +
              depths.join(", ") +
              "]"
          };
        }
        return {
          passed: true,
          reason:
            "Both 'else' clauses paired accurately (inner 'else' -> depth 2, outer 'else' -> depth 1)."
        };
      }
    },
    {
      id: 4,
      name: "Test 4: Three-level nested if-else ambiguity",
      input: "if (c1) if (c2) if (c3) s1 else s2",
      verify: function (result) {
        if (!result || result.error) {
          return {
            passed: false,
            reason: "Unexpected error on 3-level nested if-else: " + (result && result.error)
          };
        }
        if (result.isAmbiguous !== true) {
          return {
            passed: false,
            reason: "Expected isAmbiguous === true for 3-level nested if with single else."
          };
        }
        if (!Array.isArray(result.beforeTrees) || result.beforeTrees.length < 2) {
          return {
            passed: false,
            reason: "Expected competing parse trees in beforeTrees for 3-level nested if-else."
          };
        }
        if (!result.afterTree) {
          return { passed: false, reason: "Missing afterTree for 3-level nested if-else." };
        }
        const ifCount = countNodesOfKind(result.afterTree, "if");
        const resolvedDepths = getElseAttachmentDepths(result.afterTree);

        if (ifCount !== 3) {
          return {
            passed: false,
            reason: "Expected 3 nested 'if' nodes in afterTree, found " + ifCount
          };
        }
        if (resolvedDepths.length < 1 || resolvedDepths[0] !== 3) {
          return {
            passed: false,
            reason:
              "Expected 'else' to associate with innermost unmatched 'if' at depth 3, got depth " +
              resolvedDepths[0]
          };
        }
        return {
          passed: true,
          reason:
            "3-level nesting ambiguity detected and resolved to innermost unmatched 'if' (depth 3)."
        };
      }
    },
    {
      id: 5,
      name: "Test 5: Invalid syntax handling (unmatched else / malformed condition)",
      input: "if () else s1",
      verify: function (result) {
        if (!result) {
          return { passed: false, reason: "Analyzer returned null instead of error object." };
        }
        const hasErrorFlag = Boolean(result.error);
        const hasNoValidTree =
          !result.afterTree ||
          (Array.isArray(result.beforeTrees) && result.beforeTrees.length === 0);

        if (!hasErrorFlag && !hasNoValidTree) {
          return {
            passed: false,
            reason: "Expected syntax error or empty parse tree for invalid syntax 'if () else s1'."
          };
        }
        return {
          passed: true,
          reason:
            "Invalid syntax gracefully caught (" +
            (result.error || "no valid parse trees generated") +
            ")."
        };
      }
    },
    {
      id: 6,
      name: "Test 6: SVG Visualization & Mock Tree Data Verification",
      input: "if (c1) if (c2) s1 else s2",
      verify: function (_result) {
        const mockData =
          (global.MOCK_TREES && global.MOCK_TREES.ambiguousNestedIfElse) ||
          (vizModule &&
            vizModule.MOCK_TREES &&
            vizModule.MOCK_TREES.ambiguousNestedIfElse);

        if (!mockData || !Array.isArray(mockData.beforeTrees) || !mockData.afterTree) {
          return {
            passed: false,
            reason: "MOCK_TREES data missing or malformed in visualization.js."
          };
        }

        const classify =
          vizModule && typeof vizModule.classifyNode === "function"
            ? vizModule.classifyNode
            : null;

        if (classify) {
          if (classify("if (c1)") !== "if" || classify("else") !== "else") {
            return {
              passed: false,
              reason: "Node color classifier failed to identify 'if' (green) and 'else' (orange) nodes."
            };
          }
        }

        const beforeDepths0 = getElseAttachmentDepths(mockData.beforeTrees[0]);
        const beforeDepths1 = getElseAttachmentDepths(mockData.beforeTrees[1]);
        const afterDepths = getElseAttachmentDepths(mockData.afterTree);

        if (
          beforeDepths0[0] !== 2 ||
          beforeDepths1[0] !== 1 ||
          afterDepths[0] !== 2
        ) {
          return {
            passed: false,
            reason:
              "Mock tree data does not accurately represent the 2 competing trees and resolved inner-if tree."
          };
        }

        return {
          passed: true,
          reason:
            "Mock trees verified: 2 competing beforeTrees (depths 2 & 1), 1 resolved afterTree (depth 2), and green/orange node classification."
        };
      }
    }
  ];

  /**
   * Runs all compiler and visualization tests, outputs PASS/FAIL results,
   * and returns a summary object.
   *
   * @returns {{ total: number, passed: number, failed: number, results: Array<Object> }}
   */
  function runTests() {
    const results = [];
    let passedCount = 0;

    console.log("============================================================");
    console.log(" PS-04 GrammarFix — Dangling-Else Resolver Test Suite");
    console.log("============================================================");

    for (let i = 0; i < TEST_CASES.length; i++) {
      const tc = TEST_CASES[i];
      let status = "FAIL";
      let detail = "";

      try {
        const analysisResult = executeGrammarAnalysis(tc.input);
        const check = tc.verify(analysisResult);

        // If DOM containers exist and renderTrees is loaded, also verify safe rendering
        const renderFn =
          typeof global.renderTrees === "function"
            ? global.renderTrees
            : vizModule && typeof vizModule.renderTrees === "function"
            ? vizModule.renderTrees
            : null;

        if (renderFn && typeof document !== "undefined") {
          renderFn(analysisResult);
        }

        if (check.passed) {
          status = "PASS";
          passedCount++;
        }
        detail = check.reason;
      } catch (err) {
        status = "FAIL";
        detail = "Exception thrown: " + (err && err.message ? err.message : String(err));
      }

      const record = {
        id: tc.id,
        name: tc.name,
        input: tc.input,
        status: status,
        detail: detail
      };
      results.push(record);

      console.log("[" + status + "] " + tc.name);
      console.log("       Input : " + tc.input);
      console.log("       Result: " + detail);
    }

    const totalCount = TEST_CASES.length;
    const failedCount = totalCount - passedCount;

    console.log("------------------------------------------------------------");
    console.log(
      "SUMMARY: " +
        passedCount +
        " / " +
        totalCount +
        " tests PASSED (" +
        failedCount +
        " FAILED)"
    );
    console.log("============================================================");

    // If a #testResults container is present in the DOM, render a clean visual summary table
    if (typeof document !== "undefined") {
      const testContainer = document.getElementById("testResults");
      if (testContainer) {
        renderTestSummaryDom(testContainer, results, passedCount, totalCount);
      }
    }

    return {
      total: totalCount,
      passed: passedCount,
      failed: failedCount,
      results: results
    };
  }

  /**
   * Renders test results into `#testResults` if the container exists in `index.html`.
   * @param {HTMLElement} container
   * @param {Array<Object>} results
   * @param {number} passed
   * @param {number} total
   */
  function renderTestSummaryDom(container, results, passed, total) {
    container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "background:#ffffff;border:1.5px solid #cfe8d5;border-radius:10px;padding:16px;" +
      "font-family:system-ui,-apple-system,sans-serif;color:#143620;";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;" +
      "padding-bottom:10px;border-bottom:1px solid #e2f2e6;";

    const title = document.createElement("strong");
    title.style.fontSize = "15px";
    title.textContent = "Automated Test Suite Results";

    const badge = document.createElement("span");
    const allPassed = passed === total;
    badge.style.cssText =
      "padding:4px 10px;border-radius:999px;font-weight:700;font-size:12px;background:" +
      (allPassed ? "#dcfce7" : "#fee2e2") +
      ";color:" +
      (allPassed ? "#15803d" : "#b91c1c") +
      ";border:1px solid " +
      (allPassed ? "#22c55e" : "#f87171") +
      ";";
    badge.textContent = passed + " / " + total + " Tests Passed";

    header.appendChild(title);
    header.appendChild(badge);
    wrapper.appendChild(header);

    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;gap:8px;";

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const isPass = r.status === "PASS";
      const row = document.createElement("div");
      row.style.cssText =
        "padding:10px 12px;border-radius:6px;background:" +
        (isPass ? "#f4fbf6" : "#fef2f2") +
        ";border-left:4px solid " +
        (isPass ? "#16a34a" : "#dc2626") +
        ";font-size:13px;";

      const topLine = document.createElement("div");
      topLine.style.cssText = "font-weight:700;margin-bottom:3px;";
      topLine.textContent = "[" + r.status + "] " + r.name + " — `" + r.input + "`";

      const detailLine = document.createElement("div");
      detailLine.style.cssText = "font-size:12px;color:#3b5e47;";
      detailLine.textContent = r.detail;

      row.appendChild(topLine);
      row.appendChild(detailLine);
      list.appendChild(row);
    }

    wrapper.appendChild(list);
    container.appendChild(wrapper);
  }

  // Expose globally for browser and Node.js
  global.runTests = runTests;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      runTests: runTests,
      TEST_CASES: TEST_CASES,
      fallbackAnalyzeGrammar: fallbackAnalyzeGrammar
    };
  }

  // Allow direct CLI execution via `node tests.js`
  if (
    typeof require !== "undefined" &&
    typeof module !== "undefined" &&
    require.main === module
  ) {
    const summary = runTests();
    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
