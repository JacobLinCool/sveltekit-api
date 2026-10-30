import ts from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import svelte from "eslint-plugin-svelte";
export default [
	{ ignores: ["node_modules/**", "dist/**", "build/**", ".svelte-kit/**", ".idea/**"] },
	{
		files: ["**/*.{ts,js,svelte}"],
		languageOptions: { parser },
		plugins: { "@typescript-eslint": ts },
		rules: ts.configs.recommended.rules,
	},
	...svelte.configs["flat/recommended"],
	{ files: ["**/*.svelte"], languageOptions: { parserOptions: { parser } } },
	prettier,
];
