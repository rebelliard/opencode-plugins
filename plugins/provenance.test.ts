import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

describe("provenance", () => {
  it("keeps employer and internal-tooling names out of the plugins", () => {
    const banned = /adlc|mentimeter/i;
    const offenders = files(root)
      .filter((file) => !file.endsWith("provenance.test.ts"))
      .filter((file) => banned.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("gives every plugin a package.json that OpenCode can load from GitHub", () => {
    const plugins = readdirSync(root).filter((name) =>
      statSync(path.join(root, name)).isDirectory(),
    );
    expect(plugins.length).toBeGreaterThan(0);
    for (const name of plugins) {
      const pkg = JSON.parse(
        readFileSync(path.join(root, name, "package.json"), "utf8"),
      );
      expect(pkg.name, name).toBe(`@rebelliard/opencode-${name}`);
      expect(pkg.opencode?.plugin, name).toBe("./index.ts");
      expect(pkg.license, name).toBe("MIT");
    }
  });
});
