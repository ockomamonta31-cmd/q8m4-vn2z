package opendota;

import com.google.gson.*;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;
import org.apache.commons.compress.compressors.zstandard.ZstdCompressorInputStream;

/** Preserve the parser's actual entity positions and combat log before aggregation. */
public class SpatialReplay {
    public static void main(String[] args) throws Exception {
        var url = URI.create(args[0]);
        if (!url.getHost().matches("replay[0-9]+\\.valve\\.net") || !url.getPath().matches("/570/[0-9]+_[0-9]+\\.dem\\.bz2"))
            throw new IllegalArgumentException("Expected Valve replay URL");
        var client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).connectTimeout(Duration.ofSeconds(30)).build();
        var response = client.send(HttpRequest.newBuilder(url).timeout(Duration.ofMinutes(3)).build(), HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() != 200) throw new IOException("Replay HTTP " + response.statusCode());
        byte[] data = response.body();
        InputStream stream = new ByteArrayInputStream(data);
        if (data.length >= 4 && data[0] == 'B' && data[1] == 'Z') stream = new BZip2CompressorInputStream(stream);
        else if (data.length >= 4 && data[0] == 0x28 && (data[1] & 255) == 0xB5) stream = new ZstdCompressorInputStream(stream);
        Parse parsed;
        try (var input = stream) { parsed = new Parse(input, OutputStream.nullOutputStream(), false); }
        var slots = new HashMap<Integer, Integer>();
        for (Entry e : parsed.finalList) if ("player_slot".equals(e.type)) slots.put(Integer.valueOf(e.key), e.value);
        var tracks = new TreeMap<Integer, List<Object[]>>();
        var heroes = new TreeMap<Integer, Integer>();
        var combat = new ArrayList<Object[]>();
        for (Entry e : parsed.finalList) {
            if (e.time == null || e.time < 0) continue;
            if ("interval".equals(e.type) && e.time % 2 == 0 && e.x != null && e.y != null && slots.containsKey(e.slot)) {
                int slot = slots.get(e.slot);
                heroes.put(slot, e.hero_id);
                tracks.computeIfAbsent(slot, k -> new ArrayList<>()).add(new Object[]{e.time, Math.round(e.x * 10) / 10.0, Math.round(e.y * 10) / 10.0,
                    e.life_state, e.networth, e.xp, e.lh, e.kills, e.deaths, e.assists, e.tower_damage});
            }
            if (Set.of("DOTA_COMBATLOG_DAMAGE", "DOTA_COMBATLOG_DEATH", "DOTA_COMBATLOG_ABILITY", "DOTA_COMBATLOG_ITEM", "DOTA_COMBATLOG_HEAL").contains(e.type)) {
                // Retain hero events (including their building/creep damage), not ambient creep fights.
                if (Boolean.TRUE.equals(e.attackerhero) || Boolean.TRUE.equals(e.targethero))
                    combat.add(new Object[]{e.time, e.type.replace("DOTA_COMBATLOG_", ""), e.attackername, e.targetname, e.value, e.inflictor,
                        e.attackerhero, e.targethero, e.attackerillusion, e.targetillusion});
            }
        }
        if (tracks.size() != 10 || tracks.values().stream().anyMatch(t -> t.size() < 60)) throw new IOException("Incomplete hero trajectories");
        var gson = new Gson();
        var output = gson.toJsonTree(new CreateParsedDataBlob().createParsedDataBlob(parsed.finalList)).getAsJsonObject();
        var movement = new JsonObject();
        movement.addProperty("version", 1);
        movement.addProperty("sampleSeconds", 2);
        movement.add("heroes", gson.toJsonTree(heroes));
        movement.add("tracks", gson.toJsonTree(tracks));
        movement.add("combat", gson.toJsonTree(combat));
        output.add("movement", movement);
        Files.writeString(Path.of(args[1]), gson.toJson(output));
        System.out.println("Spatial replay: " + tracks.values().stream().mapToInt(List::size).sum() + " positions, " + combat.size() + " combat events");
    }
}
