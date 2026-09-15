export default {
    locales: ["en"],
    extract: {
        input: "src/**/*.{js,jsx,ts,tsx}",
        output: "public\\locales\\{{language}}\\{{namespace}}.json",
    },
}
