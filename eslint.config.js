import globals from 'globals';

export default [
    {
        ignores: [
            'venv/**',
            'web/staticfiles/**',
            '_generated_site/**',
            'node_modules/**',
            'web/classes/static/js/schedule_build.bundle.js',
        ],
    },
    {
        files: ['web/classes/static/js/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                CourseApi: 'readonly',
                html2canvas: 'readonly',
            },
        },
        rules: {
            'no-undef': 'error',
            'no-dupe-args': 'error',
            'no-dupe-keys': 'error',
            'no-func-assign': 'error',
            'no-invalid-regexp': 'error',
            'no-redeclare': 'error',
            'no-self-assign': 'error',
            'no-sparse-arrays': 'error',
            'no-unreachable': 'error',
            'no-unsafe-finally': 'error',
            'no-unsafe-negation': 'error',
            'valid-typeof': 'error',
            eqeqeq: ['error', 'always'],
            'no-async-promise-executor': 'error',
        },
    },
    {
        files: ['web/classes/static/js/schedule/**/*.js', 'web/classes/static/js/schedule_build.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                CourseApi: 'readonly',
                html2canvas: 'readonly',
            },
        },
    },
    {
        files: ['tests/**/*.js', 'vitest.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
    },
];
