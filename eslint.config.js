const stylistic = require("@stylistic/eslint-plugin");

module.exports = [
    {
        plugins: {
            "@stylistic": stylistic,
        },
        ignores: ["node_modules/**", "package.json", "package-lock.json"],
        rules: {
            "@stylistic/indent": ["error", 4],
            "@stylistic/semi": "error",
            "@stylistic/quotes": ["error", "double"],
            "@stylistic/comma-dangle": ["error", "always-multiline"],
            "@stylistic/object-curly-spacing": ["error", "always"],
            "@stylistic/arrow-parens": ["error", "always"],
            "@stylistic/max-len": ["error", { code: 140 }],
            "@stylistic/linebreak-style": ["error", "unix"],
            "@stylistic/newline-per-chained-call": [
                "error",
                { ignoreChainWithDepth: 1 },
            ],
            "@stylistic/space-before-function-paren": [
                "error",
                { anonymous: "always", named: "always" },
            ],
            "@stylistic/space-in-parens": ["error", "never"],
            "@stylistic/no-tabs": "error",
            "@stylistic/no-trailing-spaces": "error",
        },
    },
];
