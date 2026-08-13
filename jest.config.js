module.exports = {
    testEnvironment: "node",
    transform: {
        "^.+\\.tsx?$": "babel-jest"
    },
    testMatch: [
        "**/tests/**/*.test.ts"
    ]
};