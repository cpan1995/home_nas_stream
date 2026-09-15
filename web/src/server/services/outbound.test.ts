import test from "node:test"
import assert from "node:assert/strict"
import { isPublicAddress, validateDestination } from "./outbound.js"

test("provider media cannot target loopback, private networks or credential URLs", () => {
    for (const url of ["http://127.0.0.1", "http://[::1]", "http://169.254.169.254/", "http://10.0.0.1", "http://192.168.1.1", "http://localhost", "http://tv.localhost", "https://example.com:8443", "https://user:secret@example.com", "file:///etc/passwd"]) {
        assert.throws(() => validateDestination(url), /blocked/, url)
    }
    assert.equal(validateDestination("https://example.com/video.m3u8").hostname, "example.com")
})

test("DNS address checks reject mapped and reserved addresses", () => {
    for (const address of ["::ffff:127.0.0.1", "::ffff:192.168.1.2", "fc00::1", "fe80::1", "0.0.0.0", "100.64.0.1", "224.0.0.1", "invalid"]) {
        assert.equal(isPublicAddress(address), false, address)
    }
    assert.equal(isPublicAddress("8.8.8.8"), true)
})
