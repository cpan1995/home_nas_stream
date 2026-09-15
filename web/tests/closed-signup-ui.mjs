import assert from "node:assert/strict"
import { chromium } from "@playwright/test"

const baseURL = process.env.WEB_TEST_URL || "http://localhost:5180"
const browser = await chromium.launch({ headless: true })
try {
    const check = await browser.newContext()
    const sessionResponse = await check.request.get(`${baseURL}/auth/session`)
    assert.equal(sessionResponse.status(), 200)
    assert.equal((await sessionResponse.json()).signupEnabled, false, "Run against a server with signup disabled")
    const signup = await check.request.post(`${baseURL}/auth/signup`, {
        headers: { Origin: baseURL },
        data: { name: "Closed Signup", email: `closed-${Date.now()}@example.com`, password: "Never-created-password!" },
    })
    assert.equal(signup.status(), 403, "Server rejects public registration")
    await check.close()

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const page = await browser.newPage({ viewport })
        const errors = []
        const privateRequests = []
        page.on("pageerror", error => errors.push(error.message))
        page.on("request", request => { if (/\/api\//.test(request.url())) privateRequests.push(request.url()) })
        for (const path of ["/", "/signup", "/login"]) {
            await page.goto(`${baseURL}${path}`)
            await page.waitForURL("**/login")
            await page.getByRole("button", { name: "Log in", exact: true }).waitFor()
            assert.equal(await page.getByRole("link", { name: "Sign up", exact: true }).count(), 0)
            assert.equal(await page.getByRole("button", { name: "Create account", exact: true }).count(), 0)
            assert.equal(await page.getByLabel("Name", { exact: true }).count(), 0)
            assert.equal(await page.getByLabel("Confirm password", { exact: true }).count(), 0)
            assert.equal(await page.locator("body").evaluate(el => el.scrollWidth <= innerWidth), true)
        }
        await page.goto(`${baseURL}/?auth_error=signup_closed`)
        await page.waitForURL("**/login?auth_error=signup_closed")
        await page.getByRole("alert").filter({ hasText: "Registration is closed." }).waitFor()
        await page.goto(`${baseURL}/login`)
        await page.getByRole("button", { name: "Log in", exact: true }).waitFor()
        assert.deepEqual(privateRequests, [], "Signed-out views do not request private APIs")
        await page.screenshot({ path: `/tmp/web-closed-login-${viewport.width}.png`, fullPage: true })

        // Existing-account login UI contract; real authentication is covered by server tests.
        let signedIn = false
        const user = { id: "existing-user", name: "Existing Viewer", email: "existing@example.com" }
        await page.route("**/auth/session", route => route.fulfill({ json: { signupEnabled: false, configured: true, user: signedIn ? user : null } }))
        await page.route("**/auth/login", route => {
            assert.equal(route.request().method(), "POST")
            assert.deepEqual(route.request().postDataJSON(), { email: user.email, password: "Existing-password!" })
            signedIn = true
            return route.fulfill({ json: { user } })
        })
        await page.reload()
        await page.getByRole("button", { name: "Continue with Google" }).waitFor()
        await page.getByLabel("Email", { exact: true }).fill(user.email)
        await page.getByLabel("Password", { exact: true }).fill("Existing-password!")
        await page.getByRole("button", { name: "Log in", exact: true }).click()
        await page.getByRole("button", { name: "Your account" }).waitFor()
        await page.goto(`${baseURL}/login`)
        await page.waitForURL(`${baseURL}/`)
        await page.getByRole("button", { name: "Your account" }).click()
        await page.getByText(user.email, { exact: true }).waitFor()
        assert.deepEqual(errors, [])
        await page.close()
    }
    console.log("Closed-signup checks passed on desktop/mobile: server rejects registration, root/signup route to login, no signup fields/links, optional Google, existing login UI, authenticated redirect, and private API gate.")
} finally {
    await browser.close()
}
