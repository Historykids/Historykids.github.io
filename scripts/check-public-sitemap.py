"""Verify the deployed sitemap with real HTTPS requests, without credentials."""

from html.parser import HTMLParser
from pathlib import Path
import sys
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://historykids.github.io"
SITEMAP = ORIGIN + "/sitemap.xml"
NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9"
MAX_BYTES = 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fetch(url):
    require(urlsplit(url).scheme == "https" and urlsplit(url).netloc == "historykids.github.io", "unexpected host: " + url)
    request = Request(url, headers={"User-Agent": "HistoryKidsSitemapCheck/1.0"})
    with urlopen(request, timeout=30) as response:
        status = response.status
        final_url = response.geturl()
        content_type = response.headers.get_content_type()
        body = response.read(MAX_BYTES + 1)
    print(f"HTTP {status} | {content_type} | {len(body)} bytes | {url}", flush=True)
    require(status == 200, f"{url}: expected HTTP 200, got {status}")
    require(final_url == url, f"{url}: redirected to {final_url}")
    require(0 < len(body) <= MAX_BYTES, f"{url}: empty or oversized response")
    return body, content_type


class CanonicalParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_head = False
        self.canonicals = []

    def handle_starttag(self, tag, attrs):
        if tag == "head":
            self.in_head = True
        if tag == "link" and self.in_head:
            values = dict(attrs)
            if "canonical" in (values.get("rel") or "").lower().split():
                self.canonicals.append(values.get("href"))

    def handle_endtag(self, tag):
        if tag == "head":
            self.in_head = False


def main():
    sitemap, content_type = fetch(SITEMAP)
    require(content_type in {"application/xml", "text/xml", "text/plain", "application/octet-stream"}, "sitemap returned an unexpected content type: " + content_type)
    require(sitemap == (ROOT / "sitemap.xml").read_bytes(), "deployed sitemap differs from the committed sitemap")
    root = ET.fromstring(sitemap)
    require(root.tag == "{" + NAMESPACE + "}urlset", "invalid sitemap XML namespace or root element")
    urls = [el.text for el in root.findall("s:url/s:loc", {"s": NAMESPACE})]
    require(urls and len(urls) == len(set(urls)), "empty sitemap or duplicate URLs")
    require(all(url and url.startswith(ORIGIN + "/") and not urlsplit(url).query and not urlsplit(url).fragment for url in urls), "invalid sitemap URL")
    print(f"PASS public XML parses correctly and matches the committed file: {len(urls)} canonical URLs", flush=True)

    robots_body, _ = fetch(ORIGIN + "/robots.txt")
    robots = RobotFileParser()
    robots.parse(robots_body.decode("utf-8-sig").splitlines())
    require(robots.can_fetch("Googlebot", SITEMAP), "robots.txt blocks Googlebot from the sitemap")
    require(SITEMAP in (robots.site_maps() or []), "robots.txt is missing the sitemap URL")
    print("PASS robots.txt allows Googlebot and declares the correct sitemap URL", flush=True)

    text_body, _ = fetch(ORIGIN + "/sitemap.txt")
    require(text_body.decode("utf-8-sig").splitlines() == urls, "text sitemap does not match the XML sitemap")
    print("PASS text sitemap lists the same URLs", flush=True)

    for url in urls:
        require(robots.can_fetch("Googlebot", url), "robots.txt blocks the page: " + url)
        body, content_type = fetch(url)
        require(content_type == "text/html", "page is not served as HTML: " + url)
        parser = CanonicalParser()
        parser.feed(body.decode("utf-8-sig"))
        require(parser.canonicals == [url], "canonical mismatch on " + url)
    print(f"PASS all {len(urls)} public pages return HTTP 200 and matching canonical URLs", flush=True)
    print("Public sitemap verification succeeded. This checks public delivery; it does not impersonate Googlebot or access Search Console.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
