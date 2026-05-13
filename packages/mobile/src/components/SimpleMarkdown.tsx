import React from "react";
import { View, Text, Linking, StyleSheet, TouchableOpacity } from "react-native";

interface Props {
  children: string;
}

export function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const patterns = [
    { regex: /\*\*(.+?)\*\*/, style: styles.bold },
    { regex: /__(.+?)__/, style: styles.bold },
    { regex: /\*(.+?)\*/, style: styles.italic },
    { regex: /_(.+?)_/, style: styles.italic },
    { regex: /`(.+?)`/, code: true },
    { regex: /\[(.+?)\]\((.+?)\)/, link: true },
  ];

  while (remaining.length > 0) {
    let bestMatch: { index: number; length: number; node: React.ReactNode } | null = null;

    for (const p of patterns) {
      const m = remaining.match(p.regex);
      if (m && m.index !== undefined) {
        if (!bestMatch || m.index < bestMatch.index) {
          let node: React.ReactNode;
          if (p.link) {
            node = (
              <TouchableOpacity key={key++} onPress={() => Linking.openURL(m[2])}>
                <Text style={styles.link}>{m[1]}</Text>
              </TouchableOpacity>
            );
          } else if (p.code) {
            node = (
              <Text key={key++} style={styles.codeInline}>
                {" " + m[1] + " "}
              </Text>
            );
          } else {
            node = (
              <Text key={key++} style={p.style}>
                {parseInline(m[1])}
              </Text>
            );
          }
          bestMatch = { index: m.index, length: m[0].length, node };
        }
      }
    }

    if (bestMatch) {
      if (bestMatch.index > 0) {
        nodes.push(<Text key={key++}>{remaining.slice(0, bestMatch.index)}</Text>);
      }
      nodes.push(bestMatch.node);
      remaining = remaining.slice(bestMatch.index + bestMatch.length);
    } else {
      nodes.push(<Text key={key++}>{remaining}</Text>);
      break;
    }
  }

  return nodes;
}

export default function SimpleMarkdown({ children }: Props) {
  const lines = children.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(
        <View key={key++} style={styles.codeBlock}>
          {lang ? <Text style={styles.codeLang}>{lang}</Text> : null}
          <Text style={styles.codeBlockText}>{codeLines.join("\n")}</Text>
        </View>
      );
      continue;
    }

    if (line.startsWith("# ")) {
      blocks.push(
        <Text key={key++} style={styles.h1}>{parseInline(line.slice(2))}</Text>
      );
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push(
        <Text key={key++} style={styles.h2}>{parseInline(line.slice(3))}</Text>
      );
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(
        <Text key={key++} style={styles.h3}>{parseInline(line.slice(4))}</Text>
      );
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <View key={key++} style={styles.blockquote}>
          <Text>{parseInline(quoteLines.join(" "))}</Text>
        </View>
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <View key={key++} style={styles.list}>
          {items.map((item, idx) => (
            <View key={idx} style={styles.listItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listItemText}>{parseInline(item)}</Text>
            </View>
          ))}
        </View>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <View key={key++} style={styles.list}>
          {items.map((item, idx) => (
            <View key={idx} style={styles.listItem}>
              <Text style={styles.bullet}>{idx + 1}.</Text>
              <Text style={styles.listItemText}>{parseInline(item)}</Text>
            </View>
          ))}
        </View>
      );
      continue;
    }

    // Regular paragraph
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <Text key={key++} style={styles.paragraph}>
        {parseInline(paraLines.join(" "))}
      </Text>
    );
  }

  return <View style={styles.container}>{blocks}</View>;
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  paragraph: { fontSize: 13, color: "#374151", lineHeight: 20 },
  h1: { fontSize: 18, fontWeight: "700", color: "#111827", marginVertical: 8 },
  h2: { fontSize: 16, fontWeight: "700", color: "#111827", marginVertical: 6 },
  h3: { fontSize: 14, fontWeight: "700", color: "#111827", marginVertical: 4 },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  codeInline: { backgroundColor: "#e5e7eb", borderRadius: 6, fontFamily: "monospace", fontSize: 12, color: "#4f46e5" },
  codeBlock: { backgroundColor: "#f3f4f6", padding: 12, borderRadius: 8, marginVertical: 4 },
  codeLang: { fontSize: 11, color: "#6b7280", marginBottom: 4, textTransform: "uppercase" },
  codeBlockText: { fontFamily: "monospace", fontSize: 12, color: "#374151", lineHeight: 18 },
  blockquote: { borderLeftWidth: 3, borderLeftColor: "#e5e7eb", paddingLeft: 10, marginVertical: 4 },
  link: { color: "#4f46e5", textDecorationLine: "underline" },
  list: { marginVertical: 4, gap: 4 },
  listItem: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  bullet: { fontSize: 13, color: "#374151", lineHeight: 20, minWidth: 16 },
  listItemText: { flex: 1, fontSize: 13, color: "#374151", lineHeight: 20 },
});
