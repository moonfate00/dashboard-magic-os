# Release Process

This process follows the current Obsidian plugin submission contract and the official sample plugin release workflow.

Official references:

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Obsidian releases directory](https://github.com/obsidianmd/obsidian-releases)

## Alpha release for GitHub and BRAT

1. Confirm the public repository owner, author name, repository URL, and security-advisory channel.
2. Run `npm ci`, `npm run check`, and `npm run package:verify` in a clean checkout.
3. Confirm `package.json`, `manifest.json`, and `versions.json` use the same prerelease version.
4. Commit the release state, then create a tag exactly equal to the manifest version, without an added `v` prefix.
5. Push the tag. GitHub Actions rebuilds, audits, attests, and creates a draft release.
6. Inspect the draft assets. They must be exactly `main.js`, `manifest.json`, and `styles.css`, all from the same workflow run.
7. Review the changelog, privacy disclosures, and provenance attestation, then publish the draft.
8. Install from the release in a clean desktop test vault before inviting BRAT testers.

## Community Plugins submission

Obsidian's current directory requires a pure `x.y.z` manifest version for the initial submission. Before submission:

1. Complete desktop and mobile behavior review. Keep `isDesktopOnly: true` unless mobile is genuinely tested and supported.
2. Add reviewed screenshots and replace any placeholder repository/security links.
3. Change to a pure three-part version and run the version synchronization script through `npm version` or update all version files together.
4. Run `npm run package:community`. A prerelease suffix intentionally fails this gate.
5. Publish a GitHub Release whose tag exactly matches the manifest version and whose assets contain the three plugin files.
6. Submit the public repository URL through the Obsidian Community directory. The default-branch manifest must already match the published release.

Do not submit or publish the private production plugin directory. It contains local runtime state and is not the distributable source repository.
