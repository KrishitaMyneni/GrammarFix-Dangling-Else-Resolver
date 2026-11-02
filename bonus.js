(function () {
    "use strict";

    const depthSelector = document.getElementById("nestingDepth");
    const generateButton = document.getElementById("generateTestCaseBtn");
    const codeInput = document.getElementById("codeInput");
    const status = document.getElementById("bonusStatus");
    const placementHint = document.getElementById("elsePlacementHint");

    /**
     * Generates nested if-else code.
     * Positions are numbered from outermost (1) to innermost (depth).
     *
     * @param {number} depth - Nesting depth from 1 to 5.
     * @param {number[]} elsePositions - If positions that receive else clauses.
     * @returns {string} Generated code.
     */
    function generateTestCase(depth, elsePositions) {
        depth = Number(depth);

        if (!Number.isInteger(depth) || depth < 1 || depth > 5) {
            throw new Error("Nesting depth must be between 1 and 5.");
        }

        if (!Array.isArray(elsePositions)) {
            throw new Error("Else positions must be an array.");
        }

        const positions = [...new Set(elsePositions.map(Number))].sort(
            (a, b) => a - b
        );

        if (positions.some(
            position =>
                !Number.isInteger(position) ||
                position < 1 ||
                position > depth
        )) {
            throw new Error("Invalid else position for selected depth.");
        }

        const selected = new Set(positions);

        function buildIf(level) {
            const indent = "    ".repeat(level - 1);
            const condition = `condition${level}`;

            let code = `${indent}if (${condition}) {\n`;

            if (level < depth) {
                code += buildIf(level + 1);
            } else {
                code += `${indent}    statement${level}();\n`;
            }

            code += `${indent}}`;

            if (selected.has(level)) {
                code += ` else {\n`;
                code += `${indent}    elseStatement${level}();\n`;
                code += `${indent}}`;
            }

            code += "\n";

            return code;
        }

        return buildIf(1).trimEnd();
    }

    // Expose generator globally.
    window.generateTestCase = generateTestCase;

    function updatePlacementOptions() {
        if (!depthSelector) return;

        const depth = Number(depthSelector.value);
        const checkboxes = document.querySelectorAll(
            'input[name="elsePosition"]'
        );

        checkboxes.forEach(checkbox => {
            const position = Number(checkbox.value);
            const label = checkbox.closest("label");

            checkbox.disabled = position > depth;

            if (position > depth) {
                checkbox.checked = false;
            }

            if (label) {
                label.style.opacity = position > depth ? "0.4" : "1";
            }
        });

        if (placementHint) {
            placementHint.textContent =
                "Positions are numbered from outermost (1) to innermost (" +
                depth +
                "). Braces preserve the selected else associations.";
        }
    }

    function handleGenerate() {
        try {
            const depth = Number(depthSelector.value);

            const elsePositions = Array.from(
                document.querySelectorAll(
                    'input[name="elsePosition"]:checked'
                )
            ).map(checkbox => Number(checkbox.value));

            const generatedCode = generateTestCase(depth, elsePositions);

            if (!codeInput) {
                throw new Error("Could not find the #codeInput textarea.");
            }

            codeInput.value = generatedCode;
            codeInput.dispatchEvent(
                new Event("input", { bubbles: true })
            );

            if (status) {
                status.textContent =
                    "Test case generated successfully! " +
                    "Selected else positions: " +
                    (elsePositions.length ? elsePositions.join(", ") : "None") +
                    ". Click Analyze to inspect it.";
            }

            if (typeof window.analyzeGrammar !== "function") {
                if (status) {
                    status.textContent +=
                        " Note: analyzeGrammar() is not loaded yet.";
                }
            }

        } catch (error) {
            if (status) {
                status.textContent = error.message;
            } else {
                console.error(error);
            }
        }
    }

    function initializeBonusBuilder() {
        if (!depthSelector || !generateButton) {
            console.warn(
                "Bonus builder controls not found. Check the HTML element IDs."
            );
            return;
        }

        depthSelector.addEventListener("change", updatePlacementOptions);
        generateButton.addEventListener("click", handleGenerate);

        updatePlacementOptions();
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeBonusBuilder
        );
    } else {
        initializeBonusBuilder();
    }
})();