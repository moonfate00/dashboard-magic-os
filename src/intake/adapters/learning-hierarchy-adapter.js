"use strict";

function cleanTitle(value, max = 160) {
  return String(value || "")
    .replace(/<!--.*?-->/g, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[（(]?[一二三四五六七八九十百0-9]+[）).、]\s*/, "")
    .replace(/[*_`]/g, "")
    .trim()
    .slice(0, max);
}

function titleKey(value) {
  return cleanTitle(value, 240)
    .replace(/[\s“”"'：:·，,。！？!?、—–-]/g, "")
    .toLocaleLowerCase("zh-Hans-CN");
}

function stableId(prefix, value, index) {
  const ascii = titleKey(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `${prefix}-${ascii || index + 1}`;
}

function learningCatalog(input = {}) {
  const roots = Array.isArray(input.learningRoots) ? input.learningRoots : [];
  return roots.filter(Boolean).slice(0, 80).map((root) => ({
    path: String(root.path || ""),
    title: cleanTitle(root.title || root.name || "Untitled P1"),
    branches: (Array.isArray(root.branches) ? root.branches : []).filter(Boolean).slice(0, 80).map((branch) => ({
      path: String(branch.path || ""),
      title: cleanTitle(branch.title || branch.name || "Untitled P2")
    }))
  }));
}

function matchExisting(title, roots) {
  const key = titleKey(title);
  if (!key) return null;
  let best = null;
  roots.forEach((root) => root.branches.forEach((branch) => {
    const candidate = titleKey(branch.title);
    if (!candidate) return;
    const exact = candidate === key;
    const contained = key.length >= 4 && candidate.length >= 4 && (candidate.includes(key) || key.includes(candidate));
    if (!exact && !contained) return;
    const score = exact ? 1000 : Math.min(candidate.length, key.length);
    if (!best || score > best.score) best = { score, root, branch };
  }));
  return best;
}

function analyzeLearningHierarchy(input = {}) {
  const draft = String(input.draft || "").replace(/\r\n?/g, "\n");
  const lines = draft.split("\n");
  const roots = learningCatalog(input);
  const headings = lines.map((line, lineIndex) => {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    return match ? { level: match[1].length, title: cleanTitle(match[2]), lineIndex } : null;
  }).filter((item) => item?.title);
  const h1 = headings.find((item) => item.level === 1);
  const fallbackTitle = cleanTitle(input.title || lines.find((line) => cleanTitle(line)) || "Untitled learning thread");
  const rootTitle = h1?.title || fallbackTitle || "Untitled learning thread";
  const p2Headings = headings.filter((item) => item.level === 2);
  const branches = p2Headings.map((heading, branchIndex) => {
    const nextP2 = p2Headings[branchIndex + 1];
    const endLine = nextP2?.lineIndex ?? lines.length;
    const nested = headings.filter((item) => item.lineIndex > heading.lineIndex && item.lineIndex < endLine && item.level >= 3);
    const leafHeadings = nested.filter((item, index) => {
      const next = nested[index + 1];
      return !next || next.level <= item.level;
    });
    const branchId = stableId("p2", heading.title, branchIndex);
    const cardHints = (leafHeadings.length ? leafHeadings : nested).map((item, index) => ({
      id: stableId(`p3-${branchIndex + 1}`, item.title, index),
      title: item.title,
      sourceLine: item.lineIndex + 1,
      primaryBranchId: branchId,
      relatedBranchIds: []
    })).slice(0, 80);
    const match = matchExisting(heading.title, roots);
    return {
      id: branchId,
      title: heading.title,
      order: branchIndex + 1,
      sourceLine: heading.lineIndex + 1,
      cardHints,
      matchedRootPath: match?.root?.path || "",
      matchedRootTitle: match?.root?.title || "",
      matchedBranchPath: match?.branch?.path || "",
      matchedBranchTitle: match?.branch?.title || ""
    };
  });
  const branchRanges = branches.map((branch, index) => ({
    start: branch.sourceLine - 1,
    end: branches[index + 1] ? branches[index + 1].sourceLine - 1 : lines.length
  }));
  const looseCards = headings.filter((item) => item.level >= 3 && !branchRanges.some((range) => item.lineIndex > range.start && item.lineIndex < range.end));
  const p3Count = branches.reduce((sum, branch) => sum + branch.cardHints.length, 0) + looseCards.length;
  const matchedBranches = branches.filter((branch) => branch.matchedBranchPath);
  const matchedRoots = [...new Set(matchedBranches.map((branch) => branch.matchedRootPath).filter(Boolean))];
  const warnings = [];
  if (draft && !p2Headings.length) warnings.push("learning-hierarchy.missing-p2");
  if (p2Headings.length && !p3Count) warnings.push("learning-hierarchy.missing-p3");
  if (matchedRoots.length > 1) warnings.push("learning-hierarchy.multiple-p1-matches");
  return Object.freeze({
    levelCount: 3,
    noP4: true,
    root: Object.freeze({ id: stableId("p1", rootTitle, 0), title: rootTitle }),
    branches: Object.freeze(branches.map((branch) => Object.freeze({ ...branch, cardHints: Object.freeze(branch.cardHints.map(Object.freeze)) }))),
    looseCards: Object.freeze(looseCards.map((item, index) => Object.freeze({
      id: stableId("p3-loose", item.title, index), title: item.title, sourceLine: item.lineIndex + 1,
      primaryBranchId: "", relatedBranchIds: Object.freeze([])
    }))),
    matchedBranchPaths: Object.freeze(matchedBranches.map((branch) => branch.matchedBranchPath)),
    matchedRootPaths: Object.freeze(matchedRoots),
    warnings: Object.freeze(warnings),
    summary: Object.freeze({
      total: Number(Boolean(draft)) + (Array.isArray(input.sourceRefs) ? input.sourceRefs.length : 0),
      p1Count: draft ? 1 : 0,
      p2Count: branches.length,
      p3Count,
      matchedP2Count: matchedBranches.length,
      explicitOutline: Boolean(p2Headings.length)
    })
  });
}

const learningHierarchyAdapter = Object.freeze({
  id: "navigation-learning-hierarchy",
  cabinId: "navigation",
  label: "Learning Hierarchy Adapter",
  inspect(input = {}) {
    const hierarchy = analyzeLearningHierarchy(input);
    return Object.freeze({
      summary: hierarchy.summary,
      hierarchy,
      suggestedTypeId: "study-note",
      warnings: hierarchy.warnings,
      sections: Object.freeze(["P1-root", "P2-primary-parent", "P2-related-nodes", "P3-cards", "source"]),
      contract: Object.freeze({ levels: Object.freeze(["P1", "P2", "P3"]), p3IsCard: true, allowP4: false, ownership: "one-primary-many-related" })
    });
  }
});

module.exports = { analyzeLearningHierarchy, cleanTitle, learningHierarchyAdapter, titleKey };
