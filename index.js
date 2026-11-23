import { createHash, randomBytes } from "node:crypto";

const norm = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function client(settings) {
  let base = String(settings.url || "").trim().replace(/\/+$/, "");
  if (base && !/^https?:\/\//i.test(base)) base = `http://${base}`;
  if (!base || !settings.username || !settings.password) {
    throw new Error("Navidrome URL, username and password must be set");
  }
  async function call(endpoint, params = {}, method = "GET") {
    const salt = randomBytes(8).toString("hex");
    const q = new URLSearchParams({
      u: settings.username,
      t: createHash("md5").update(settings.password + salt).digest("hex"),
      s: salt,
      v: "1.16.1",
      c: "aurral-navidrome-sync",
      f: "json",
    });
    for (const [k, v] of Object.entries(params)) {
      for (const item of Array.isArray(v) ? v : [v]) q.append(k, String(item));
    }
    let response;
    try {
      response = await fetch(`${base}/rest/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: q.toString(),
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      const cause = error?.cause?.code || error?.cause?.message || error?.message;
      throw new Error(`Can't reach Navidrome at ${base} (${cause}). Aurral must be able to reach this address from where it runs.`);
    }
    if (!response.ok) throw new Error(`Navidrome answered ${response.status} for ${endpoint}`);
    const body = (await response.json())["subsonic-response"];
    if (!body || body.status !== "ok") {
      throw new Error(`Navidrome: ${body?.error?.message ?? "bad response"} (${endpoint})`);
    }
    return body;
  }
  return { call, username: settings.username };
}

const displayName = (settings, playlist) =>
  `${settings.prefix || ""}${playlist.title || playlist.name}`.trim();

async function findPlaylist(nd, name) {
  const { playlists } = await nd.call("getPlaylists");
  const all = playlists?.playlist ?? [];
  return (
    all.find((p) => p.name === name && (!p.owner || p.owner === nd.username)) ?? null
  );
}

async function matchTrack(nd, track, cache) {
  const key = `${norm(track.artist)}|${norm(track.title)}`;
  if (cache.has(key)) return cache.get(key);
  let found = null;
  const queries = [`${track.artist} ${track.title}`, track.title];
  for (const query of queries) {
    const result = await nd.call("search3", {
      query,
      songCount: 30,
      artistCount: 0,
      albumCount: 0,
    });
    const songs = result.searchResult3?.song ?? [];
    if (track.mbid) {
      found = songs.find((s) => s.musicBrainzId === track.mbid) ?? null;
    }
    if (!found) {
      const candidates = songs.filter(
        (s) =>
          norm(s.title) === norm(track.title) &&
          (norm(s.artist) === norm(track.artist) ||
            norm(s.albumArtist) === norm(track.artist)),
      );
      found =
        (track.album && candidates.find((s) => norm(s.album) === norm(track.album))) ||
        candidates.find(
          (s) => track.durationMs && Math.abs(s.duration * 1000 - track.durationMs) < 3000,
        ) ||
        candidates[0] ||
        null;
    }
    if (found) break;
  }
  cache.set(key, found?.id ?? null);
  return found?.id ?? null;
}

async function syncPlaylist(settings, playlist) {
  const nd = client(settings);
  const name = displayName(settings, playlist);
  const cache = new Map();
  const ids = [];
  const missing = [];
  for (const track of playlist.tracks ?? []) {
    const id = await matchTrack(nd, track, cache);
    if (id) ids.push(id);
    else missing.push(`${track.artist} - ${track.title}`);
  }
  const existing = await findPlaylist(nd, name);
  let id;
  if (existing) {
    // createPlaylist with playlistId replaces the whole song list.
    await nd.call("createPlaylist", { playlistId: existing.id, songId: ids });
    id = existing.id;
    if (ids.length === 0) {
      await nd.call("updatePlaylist", {
        playlistId: id,
        songIndexToRemove: Array.from({ length: existing.songCount ?? 0 }, (_, i) => i),
      });
    }
  } else {
    const created = await nd.call("createPlaylist", { name, songId: ids });
    id = created.playlist?.id;
    if (!id) throw new Error("Navidrome did not return the new playlist");
  }
  await nd.call("updatePlaylist", { playlistId: id, public: Boolean(settings.public) });
  if (missing.length) {
    console.log(`"${name}": ${missing.length} not in Navidrome: ${missing.slice(0, 20).join("; ")}`);
  }
  return { name, matched: ids.length, total: (playlist.tracks ?? []).length, missing: missing.length };
}

export default {
  async test({ settings }) {
    const nd = client(settings);
    await nd.call("ping");
    const { playlists } = await nd.call("getPlaylists");
    return {
      message: `Connected to Navidrome as ${settings.username} (${playlists?.playlist?.length ?? 0} playlists)`,
    };
  },
  actions: {
    async sync({ settings, playlist }) {
      const r = await syncPlaylist(settings, playlist);
      return {
        message: `Synced "${r.name}" to Navidrome: ${r.matched}/${r.total} tracks matched${r.missing ? `, ${r.missing} not found` : ""}`,
      };
    },
  },
  events: {
    async "playlist.changed"({ settings, playlist }) {
      await syncPlaylist(settings, playlist);
    },
    async "playlist.removed"({ settings, playlist }) {
      if (!settings.removeOnDelete) return;
      const nd = client(settings);
      const existing = await findPlaylist(nd, displayName(settings, playlist));
      if (existing) await nd.call("deletePlaylist", { id: existing.id });
    },
  },
};
