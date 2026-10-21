import test from "node:test";
import assert from "node:assert/strict";

import { buildBranchContent, headingsAreNumbered, parseHeadings, selectSectionRanges } from "../lib/markdown.js";
import { splitFrontMatter, stringifyFrontMatter } from "../lib/frontmatter.js";

const BODY = `# Paper

## Abstract

Abstract text.

## 1 Introduction

Intro text.

## 2 Methods

### 2.1 Setup

Setup text.

\`\`\`markdown
## Not a heading
\`\`\`

## 3 Results

Results text.
`;

test("parseHeadings ignores fenced headings and numbers sections", () => {
  const parsed = parseHeadings(BODY);
  assert.deepEqual(parsed.sections.map((s) => s.title), ["Abstract", "1 Introduction", "2 Methods", "2.1 Setup", "3 Results"]);
  assert.deepEqual(parsed.sections.map((s) => s.number), ["", "1", "2", "2.1", "3"]);
});

test("selectSectionRanges includes descendants and rejects unknown selectors", () => {
  const parent = selectSectionRanges(BODY, ["2 Methods"]);
  assert.equal(parent.length, 1);
  const text = BODY.split("\n").slice(parent[0].start, parent[0].end).join("\n");
  assert.match(text, /## 2 Methods/);
  assert.match(text, /### 2.1 Setup/);
  assert.doesNotMatch(text, /## 3 Results/);

  const child = selectSectionRanges(BODY, ["2.1"]);
  const childText = BODY.split("\n").slice(child[0].start, child[0].end).join("\n");
  assert.match(childText, /### 2.1 Setup/);
  assert.doesNotMatch(childText, /## 2 Methods/);

  assert.throws(() => selectSectionRanges(BODY, ["Nope"]), /no section matches/);
});

test("selectSectionRanges reports ambiguous titles", () => {
  const body = "# T\n\n## Methods\n\na\n\n## Methods\n\nb\n";
  assert.throws(() => selectSectionRanges(body, ["Methods"]), /ambiguous/);
});

test("buildBranchContent keeps the abstract and selected sections", () => {
  const source = stringifyFrontMatter({ paper: "main", title: "Main", status: "draft", authors: ["A"] }, BODY);
  const branch = buildBranchContent({
    source,
    fromDocId: "main",
    fromVersion: 4,
    slug: "methods-only",
    title: "Methods Only",
    mode: "excerpt",
    sections: ["2 Methods"],
    includeAbstract: true,
  });
  assert.match(branch, /^---/);
  assert.match(branch, /paper: methods-only/);
  assert.match(branch, /branchOf: main/);
  assert.match(branch, /derivedFrom: main@v4/);
  assert.match(branch, /## Abstract/);
  assert.match(branch, /## 2 Methods/);
  assert.match(branch, /### 2.1 Setup/);
  assert.doesNotMatch(branch, /## 1 Introduction/);
  assert.doesNotMatch(branch, /## 3 Results/);
});

test("buildBranchContent full mode replaces the H1", () => {
  const branch = buildBranchContent({
    source: BODY,
    fromDocId: "main",
    fromVersion: 1,
    slug: "full-copy",
    title: "Full Copy",
    mode: "full",
  });
  assert.match(branch, /^# Full Copy$/m);
  assert.doesNotMatch(branch, /^# Paper$/m);
  assert.match(branch, /## 3 Results/);
});

test("headingsAreNumbered distinguishes explicit numbers", () => {
  assert.equal(headingsAreNumbered([{ title: "1 Intro" }, { title: "2 Methods" }]), true);
  assert.equal(headingsAreNumbered([{ title: "Intro" }, { title: "Methods" }]), false);
});

test("front matter round-trips metadata and body", () => {
  const source = stringifyFrontMatter({ paper: "p", title: "T", authors: ["A", "B"] }, "# T\n\nBody\n");
  const split = splitFrontMatter(source);
  assert.equal(split.data.paper, "p");
  assert.deepEqual(split.data.authors, ["A", "B"]);
  assert.equal(split.body.trim(), "# T\n\nBody");
});
