# Navidrome Sync for Aurral

An [Aurral](https://github.com/lklynet/aurral) plugin that keeps Aurral playlists and flows in sync with Navidrome.

- Creates or replaces the matching Navidrome playlist when an Aurral playlist changes (`playlist.changed`).
- "Sync to Navidrome" item in the playlist menu.
- Optionally deletes the Navidrome playlist when the Aurral one is removed.
- Matches tracks through Navidrome's search: MusicBrainz ID first, then normalised title and artist, with album and duration as tie-breakers. Tracks not in Navidrome are skipped and listed in the plugin log.

Uses the Subsonic API with token auth. No dependencies.

## Install

**Option A: from this repo.** In Aurral, go to Settings > Plugins and paste the repo link. Aurral installs from the default branch.

**Option B: copy the folder.** Put `manifest.json` and `index.js` in a folder named `navidrome-sync` inside the `plugins` folder of Aurral's data folder (`/config/plugins` in the container), then restart or reload Aurral.

**Option C: through the Aurral MCP server** (`/api/mcp`, with a developer key): call `write_plugin` with `id`, `manifest` and `code`, then `test_plugin`. The plugin must be off to be overwritten.

## Configure

Settings > Plugins > Navidrome Sync:

| Setting | Notes |
| --- | --- |
| Navidrome URL | Must be reachable from where Aurral runs. `localhost` means the Aurral container. Example: `http://192.168.x.x:4533` |
| Username / Password | A dedicated Navidrome user is recommended. Stored in the plugin's settings. |
| Playlist name prefix | Optional, added before the playlist name. |
| Delete in Navidrome when removed in Aurral | Off by default. |
| Make playlists public | Off by default. |

Press **Test**, then turn the plugin on.

## Notes

- Playlists are matched by name. Renaming a playlist in Aurral creates a new one in Navidrome.
- Aurral names its generated playlists with an `aur_` prefix, which carries over to Navidrome.
- Aurral plugins are in beta, so the API may change between Aurral releases.

## License

MIT. See [LICENSE](LICENSE).
