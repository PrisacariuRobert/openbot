import test from "node:test";
import assert from "node:assert/strict";
import { pageWatchConfig, pageWatchText, pageChange } from "./page-watch-source.js";

test("page watches ignore markup, whitespace and executable content", () => {
  const first = '<main><h1>Updates</h1><p>New feature</p></main><script>nonce=1</script>';
  const next = '<nav>Clock 12:01</nav><main class="new"><h1> Updates </h1><p>New   feature</p><div hidden>noise</div></main><script>nonce=2</script>';
  assert.equal(pageWatchText(first, "text/html"), pageWatchText(next, "text/html; charset=utf-8"));
  assert.equal(pageWatchText('<main><p>A</p><p>B</p></main>', 'text/html'), 'A\nB');
  assert.equal(pageWatchText('<main><article><p>Once</p></article></main>', 'text/html'), 'Once');
});

test("selected sections exclude unrelated changes and missing/oversized content fails visibly", () => {
  assert.equal(pageWatchText('<div id="price">€10</div><aside>time</aside>', 'text/html', '#price'), '€10');
  assert.throws(() => pageWatchText('<body>gone</body>', 'text/html', '#price'), /not found/);
  assert.throws(() => pageWatchText('x'.repeat(8001), 'text/plain'), /too much text/);
  assert.throws(() => pageWatchText('x'.repeat(1_048_577), 'text/plain'), /too large/);
  assert.throws(() => pageWatchText('', 'text/plain'), /no readable/);
  assert.throws(() => pageWatchText('binary', 'image/png'), /did not return/);
  assert.throws(() => pageWatchText('value', 'text/plain', 'main'), /only for HTML/);
});

test("RSS and Atom watch entries, not changing feed clocks", () => {
  const rss = (clock: string) => `<rss><channel><lastBuildDate>${clock}</lastBuildDate><item><title>Release</title><description>Faster search</description></item></channel></rss>`;
  assert.equal(pageWatchText(rss('yesterday'), 'application/rss+xml'), pageWatchText(rss('today'), 'application/rss+xml'));
  assert.match(pageWatchText('<feed><updated>clock</updated><entry><title>News</title><summary>Details</summary></entry></feed>', 'application/atom+xml'), /^News\nDetails$/);
  assert.throws(() => pageWatchText('<!DOCTYPE rss><rss/>', 'text/xml'), /declarations/);
  assert.throws(() => pageWatchText('<rss><channel/></rss>', 'text/xml'), /entries/);
});

test("watch addresses reject local services, credentials and unsafe selectors", () => {
  assert.deepEqual(pageWatchConfig({ pageUrl: 'https://example.com/news', pageSelector: ' #news ' }), { pageUrl: 'https://example.com/news', pageSelector: '#news' });
  for (const pageUrl of ['http://example.com', 'https://127.0.0.1', 'https://localhost', 'https://10.0.0.1', 'https://[::1]', 'https://example.com/?token=secret', 'https://user:pass@example.com', 'https://example.com/#anchor', 'file:///etc/passwd']) {
    assert.throws(() => pageWatchConfig({ pageUrl }), /public HTTPS/);
  }
  for (const pageSelector of [':has(*)', 'main > p', '#one,#two', '*', '.a'.repeat(100)]) {
    assert.throws(() => pageWatchConfig({ pageUrl: 'https://example.com', pageSelector }), /one HTML tag/);
  }
});

test("change evidence is bounded and distinguishes content from ordering", () => {
  assert.deepEqual(pageChange('a\nb', 'b\na'), { added: [], removed: [], excerptLimited: false, orderOrRepetitionOnly: true });
  assert.equal(pageChange('a\na', 'a').orderOrRepetitionOnly, true);
  const diff = pageChange('old', Array.from({length: 20}, (_, i) => String(i) + 'x'.repeat(500)).join('\n'));
  assert.equal(diff.added.length, 12); assert.equal(diff.added[0]!.length, 400);
  assert.equal(diff.excerptLimited, true); assert.deepEqual(diff.removed, ['old']);
});
