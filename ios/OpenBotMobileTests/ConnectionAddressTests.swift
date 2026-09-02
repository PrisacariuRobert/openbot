import XCTest
@testable import OpenBot

final class ConnectionAddressTests: XCTestCase {
    func testAddsHTTPSAndRemovesPaths() throws {
        let url = try ConnectionAddress.normalized("studio.example.com/setup?q=secret")
        XCTAssertEqual(url.absoluteString, "https://studio.example.com")
    }

    func testAllowsPrivateHTTPAddresses() throws {
        XCTAssertEqual(try ConnectionAddress.normalized("http://192.168.1.20:4311/").absoluteString, "http://192.168.1.20:4311")
        XCTAssertEqual(try ConnectionAddress.normalized("192.168.1.20:4311").absoluteString, "http://192.168.1.20:4311")
        XCTAssertEqual(try ConnectionAddress.normalized("http://100.80.10.2:4311").host, "100.80.10.2")
    }

    func testRejectsPlainHTTPOnThePublicInternet() {
        XCTAssertThrowsError(try ConnectionAddress.normalized("http://example.com")) { error in
            XCTAssertEqual(error as? ConnectionAddressError, .insecureRemote)
        }
    }

    func testConnectDeepLinkCarriesOnlyTheServerAddress() {
        let link = URL(string: "openbot://connect?server=https%3A%2F%2Fstudio.example.com")!
        XCTAssertEqual(OpenBotDeepLink.serverAddress(from: link), "https://studio.example.com")
        XCTAssertNil(OpenBotDeepLink.serverAddress(from: URL(string: "openbot://connect?key=never-put-secrets-here")!))
        XCTAssertNil(OpenBotDeepLink.serverAddress(from: URL(string: "openbot://connect?server=https%3A%2F%2Fstudio.example.com&key=never-put-secrets-here")!))
    }
}
