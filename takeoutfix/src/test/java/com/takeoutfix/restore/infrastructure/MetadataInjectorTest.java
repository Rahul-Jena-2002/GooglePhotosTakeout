package com.takeoutfix.restore.infrastructure;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class MetadataInjectorTest {
    @Test
    void malformedOptionalTextDoesNotDiscardAValidDate(@TempDir Path root) throws Exception {
        Path media = Files.createFile(root.resolve("photo.jpg"));
        Path json = root.resolve("photo.json");
        Files.writeString(json, "{\"photoTakenTime\":{\"timestamp\":\"1623751200\"},\"description\":42,\"title\":{},\"people\":[{\"name\":false},{\"name\":\"Alex\"}]}");
        AtomicReference<List<String>> executed = new AtomicReference<>();
        NativeExifToolEngine engine = new NativeExifToolEngine() {
            @Override public void init() {}
            @Override public boolean execute(List<String> args) { executed.set(List.copyOf(args)); return true; }
        };
        try {
            assertTrue(new MetadataInjector(engine).injectMetadataAndAlbum(media.toFile(), json.toFile(), null, null));
            assertTrue(executed.get().contains("-AllDates=2021:06:15 10:00:00"));
            assertTrue(executed.get().contains("-XMP-iptcExt:PersonInImage+=Alex"));
            assertTrue(executed.get().stream().noneMatch(arg -> arg.startsWith("-Description=")));
        } finally {
            engine.cleanup();
        }
    }

    @Test
    void oversizedMetadataTimestampFallsBackToCreationTime(@TempDir Path root) throws Exception {
        Path media = Files.createFile(root.resolve("photo.jpg"));
        Path json = root.resolve("photo.json");
        Files.writeString(json, "{\"photoTakenTime\":{\"timestamp\":\"9223372036854775807\"},\"creationTime\":{\"timestamp\":\"1623751200\"}}");
        AtomicReference<List<String>> executed = new AtomicReference<>();
        NativeExifToolEngine engine = new NativeExifToolEngine() {
            @Override public void init() {}
            @Override public boolean execute(List<String> args) { executed.set(List.copyOf(args)); return true; }
        };
        try {
            assertTrue(new MetadataInjector(engine).injectMetadataAndAlbum(media.toFile(), json.toFile(), null, null));
            assertTrue(executed.get().contains("-AllDates=2021:06:15 10:00:00"));
        } finally {
            engine.cleanup();
        }
    }

    @Test
    void invalidLocationUsesValidExifFallbackWithoutInventingCoordinates(@TempDir Path root) throws Exception {
        Path media = Files.createFile(root.resolve("photo.jpg"));
        Path json = root.resolve("photo.json");
        Files.writeString(json, "{\"photoTakenTime\":{\"timestamp\":\"1623751200\"},\"geoData\":{\"latitude\":91,\"longitude\":2},\"geoDataExif\":{\"latitude\":0,\"longitude\":12}}");
        AtomicReference<List<String>> executed = new AtomicReference<>();
        NativeExifToolEngine engine = new NativeExifToolEngine() {
            @Override public void init() {}
            @Override public boolean execute(List<String> args) { executed.set(List.copyOf(args)); return true; }
        };
        try {
            assertTrue(new MetadataInjector(engine).injectMetadataAndAlbum(media.toFile(), json.toFile(), null, null));
            assertTrue(executed.get().contains("-GPSLatitude=0.0"));
            assertTrue(executed.get().contains("-GPSLongitude=12.0"));
            assertFalse(executed.get().contains("-GPSLatitude=91.0"));
            Files.writeString(json, "{\"photoTakenTime\":{\"timestamp\":\"1623751200\"},\"geoData\":{\"latitude\":1}}");
            assertTrue(new MetadataInjector(engine).injectMetadataAndAlbum(media.toFile(), json.toFile(), null, null));
            assertTrue(executed.get().stream().noneMatch(arg -> arg.startsWith("-GPSLatitude=")));
        } finally {
            engine.cleanup();
        }
    }

    @Test
    void videoTimestampUsesExifToolWithoutExtraInPlaceWrite(@TempDir Path root) throws Exception {
        Path video = root.resolve("video.mp4");
        byte[] original = java.nio.ByteBuffer.allocate(28)
                .putInt(28).put(new byte[]{'m', 'o', 'o', 'v'})
                .putInt(20).put(new byte[]{'m', 'v', 'h', 'd'})
                .putInt(0).putInt(1).putInt(2).array();
        Files.write(video, original);
        Path json = root.resolve("video.json");
        Files.writeString(json, "{\"photoTakenTime\":{\"timestamp\":\"1623751200\"}}");
        AtomicReference<List<String>> executed = new AtomicReference<>();
        NativeExifToolEngine engine = new NativeExifToolEngine() {
            @Override public void init() {}
            @Override public boolean execute(List<String> args) {
                executed.set(List.copyOf(args));
                return true;
            }
        };
        try {
            assertTrue(new MetadataInjector(engine).injectMetadataAndAlbum(video.toFile(), json.toFile(), null, null));
            assertArrayEquals(original, Files.readAllBytes(video));
            assertTrue(executed.get().stream().anyMatch(arg -> arg.startsWith("-QuickTime:CreateDate=")));
        } finally {
            engine.cleanup();
        }
    }

    @Test
    void timestampOnlySidecarInvokesExifTool(@TempDir Path root) throws Exception {
        Path media = Files.createFile(root.resolve("photo.jpg"));
        Path json = root.resolve("photo.json");
        Files.writeString(json, "{\"photoTakenTime\":{\"timestamp\":\"1623751200\"}}");
        AtomicReference<List<String>> executed = new AtomicReference<>();
        NativeExifToolEngine engine = new NativeExifToolEngine() {
            @Override public void init() {}
            @Override public boolean execute(List<String> args) {
                executed.set(List.copyOf(args));
                return true;
            }
        };
        try {
            assertTrue(new MetadataInjector(engine).injectMetadataAndAlbum(media.toFile(), json.toFile(), null, null));
            assertNotNull(executed.get());
            assertTrue(executed.get().stream().anyMatch(arg -> arg.startsWith("-AllDates=")));
            assertEquals(media.toAbsolutePath().toString(), executed.get().get(executed.get().size() - 1));
        } finally {
            engine.cleanup();
        }
    }
}
