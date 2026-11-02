
/*
=========================================================
 PS-04: GrammarFix — Dangling-Else Resolver
 Person B: Compiler Logic & Grammar Analysis
=========================================================

 Main exported function:
     analyzeGrammar(code)

 Shared output:
     isAmbiguous
     originalGrammar
     resolvedGrammar
     beforeTrees
     afterTree
     explanation
     error
*/

(function (root) {

    const ORIGINAL_GRAMMAR = `
S -> if (E) S
S -> if (E) S else S
S -> statement
`;

    const RESOLVED_GRAMMAR = `
S -> Matched | Unmatched

Matched -> if (E) Matched else Matched
Matched -> statement

Unmatched -> if (E) S
Unmatched -> if (E) Matched else Unmatched
`;

    // =====================================================
    // 1. TOKENIZER
    // =====================================================

    function tokenize(code) {

        const regex =
            /\/\/[^\n]*|\/\*[\s\S]*?\*\/|\s+|"[^"]*"|'[^']*'|==|!=|<=|>=|&&|\|\||[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[{}();]|\S/g;

        const tokens = [];
        let match;

        while ((match = regex.exec(code)) !== null) {

            const token = match[0];

            if (/^\s+$/.test(token)) continue;

            if (
                token.startsWith("//") ||
                token.startsWith("/*")
            ) continue;

            tokens.push(token);
        }

        return tokens;
    }

    // =====================================================
    // 2. PARSER
    // =====================================================

    function createParser(tokens) {

        const statementMemo = new Map();
        const sequenceMemo = new Map();

        function parseCondition(start) {

            if (tokens[start] !== "(") {
                return null;
            }

            let balance = 0;

            for (let i = start; i < tokens.length; i++) {

                if (tokens[i] === "(") balance++;
                if (tokens[i] === ")") balance--;

                if (balance === 0) {

                    if (i === start + 1) return null;

                    return {
                        condition: tokens
                            .slice(start + 1, i)
                            .join(" "),
                        next: i + 1
                    };
                }

                if (balance < 0) return null;
            }

            return null;
        }

        // Parse one statement and return all valid interpretations.
        function parseStatement(pos, depth = 0) {

            if (depth > 100) return [];

            if (pos >= tokens.length) return [];

            if (statementMemo.has(pos)) {
                return statementMemo.get(pos);
            }

            const token = tokens[pos];
            let results = [];

            // ---------------- IF STATEMENT ----------------

            if (token === "if") {

                const parsedCondition = parseCondition(pos + 1);

                if (!parsedCondition) return [];

                const { condition, next } = parsedCondition;

                const bodyResults = parseStatement(
                    next,
                    depth + 1
                );

                for (const body of bodyResults) {

                    // Interpretation 1:
                    // IF has no ELSE.

                    results.push({
                        node: {
                            label: `if (${condition})`,
                            children: [body.node]
                        },
                        next: body.next
                    });

                    // Interpretation 2:
                    // ELSE belongs to this IF.

                    if (tokens[body.next] === "else") {

                        const elseResults = parseStatement(
                            body.next + 1,
                            depth + 1
                        );

                        for (const alternative of elseResults) {

                            results.push({
                                node: {
                                    label: `if (${condition})`,
                                    children: [
                                        body.node,
                                        {
                                            label: "else",
                                            children: [alternative.node]
                                        }
                                    ]
                                },
                                next: alternative.next
                            });
                        }
                    }
                }
            }

            // ---------------- BLOCK STATEMENT ----------------

            else if (token === "{") {

                const blocks = parseSequence(pos + 1, true);

                for (const block of blocks) {

                    results.push({
                        node: {
                            label: "Block",
                            children: block.nodes
                        },
                        next: block.next
                    });
                }
            }

            // ---------------- INVALID ELSE / BRACE ----------------

            else if (token === "else" || token === "}") {
                return [];
            }

            // ---------------- NORMAL STATEMENT ----------------

            else {

                let i = pos;

                while (
                    i < tokens.length &&
                    tokens[i] !== ";" &&
                    tokens[i] !== "}" &&
                    tokens[i] !== "else"
                ) {
                    i++;
                }

                if (i > pos && tokens[i] === ";") {

                    const statement = tokens
                        .slice(pos, i + 1)
                        .join(" ");

                    results.push({
                        node: {
                            label: statement,
                            children: []
                        },
                        next: i + 1
                    });
                }
            }

            // Remove duplicate parses and limit explosion.
            const unique = [];
            const seen = new Set();

            for (const result of results) {

                const key = JSON.stringify({
                    node: result.node,
                    next: result.next
                });

                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(result);
                }

                if (unique.length >= 256) break;
            }

            statementMemo.set(pos, unique);

            return unique;
        }

        // Parse a sequence of statements.
        // stopAtBrace = true means parse until }.
        function parseSequence(pos, stopAtBrace = false, depth = 0) {

            if (depth > 100) return [];

            const key = `${pos}:${stopAtBrace}`;

            if (sequenceMemo.has(key)) {
                return sequenceMemo.get(key);
            }

            // End of block
            if (stopAtBrace && tokens[pos] === "}") {

                return [{
                    nodes: [],
                    next: pos + 1
                }];
            }

            // End of complete program
            if (!stopAtBrace && pos === tokens.length) {

                return [{
                    nodes: [],
                    next: pos
                }];
            }

            if (pos >= tokens.length) return [];

            const results = [];

            const statements = parseStatement(pos, depth + 1);

            for (const statement of statements) {

                const remaining = parseSequence(
                    statement.next,
                    stopAtBrace,
                    depth + 1
                );

                for (const tail of remaining) {

                    results.push({
                        nodes: [
                            statement.node,
                            ...tail.nodes
                        ],
                        next: tail.next
                    });

                    if (results.length >= 256) break;
                }

                if (results.length >= 256) break;
            }

            sequenceMemo.set(key, results);

            return results;
        }

        return {
            parseProgram: () => parseSequence(0, false)
        };
    }

    // =====================================================
    // 3. NEAREST UNMATCHED IF PRIORITY
    // =====================================================

    function associationScore(node, depth = 0) {

        let score = 0;

        const isIf = node.label.startsWith("if (");

        const hasElse =
            isIf &&
            node.children.length === 2 &&
            node.children[1].label === "else";

        if (hasElse) {
            score += depth;
        }

        for (const child of node.children) {

            score += associationScore(
                child,
                depth + 1
            );
        }

        return score;
    }

    // =====================================================
    // 4. CLEAN TREE DATA
    // =====================================================

    function cleanTree(node) {

        return {
            label: node.label,
            children: (node.children || []).map(cleanTree)
        };
    }

    // =====================================================
    // 5. MAIN ANALYZER
    // =====================================================

    function analyzeGrammar(code) {

        const emptyResult = {
            isAmbiguous: false,
            originalGrammar: ORIGINAL_GRAMMAR,
            resolvedGrammar: RESOLVED_GRAMMAR,
            beforeTrees: [],
            afterTree: null,
            explanation: "",
            error: null
        };

        try {

            if (typeof code !== "string" || !code.trim()) {
                throw new Error("Please enter an if-else statement.");
            }

            // Tokenization
            const tokens = tokenize(code);

            if (tokens.length === 0) {
                throw new Error("No valid tokens found.");
            }

            // Parsing
            const parser = createParser(tokens);

            const parsed = parser.parseProgram();

            // Only complete parses are accepted.
            const valid = parsed.filter(
                result => result.next === tokens.length
            );

            if (valid.length === 0) {

                throw new Error(
                    "Invalid syntax. Check your conditions, braces, else clauses and semicolons."
                );
            }

            // Remove duplicate parse trees.
            const unique = [];
            const seen = new Set();

            for (const result of valid) {

                const tree = {
                    label: "Program",
                    children: result.nodes.map(cleanTree)
                };

                const key = JSON.stringify(tree);

                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(tree);
                }
            }

            // Rank interpretations according to
            // nearest-unmatched-IF priority.
            unique.sort((a, b) => {

                return associationScore(b) -
                       associationScore(a);
            });

            const isAmbiguous = unique.length > 1;

            // Competing interpretations before resolution.
            const beforeTrees = unique.slice(0, 2);

            // Highest-priority interpretation after resolution.
            const afterTree = unique[0];

            let explanation;

            if (isAmbiguous) {

                explanation =
                    `Dangling-else ambiguity detected! ` +
                    `The input has ${unique.length} valid parse interpretations. ` +
                    `An else clause can attach to different unmatched if statements. ` +
                    `The resolved grammar associates each else with the nearest unmatched if.`;

            } else {

                explanation =
                    "No dangling-else ambiguity detected. " +
                    "Only one valid parse interpretation was found.";
            }

            return {
                isAmbiguous,
                originalGrammar: ORIGINAL_GRAMMAR,
                resolvedGrammar: RESOLVED_GRAMMAR,
                beforeTrees,
                afterTree,
                explanation,
                error: null
            };

        } catch (err) {

            return {
                ...emptyResult,
                explanation: "Grammar analysis failed.",
                error: err.message
            };
        }
    }

    // =====================================================
    // 6. EXPORT
    // =====================================================

    root.analyzeGrammar = analyzeGrammar;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { analyzeGrammar };
    }

})(globalThis);
