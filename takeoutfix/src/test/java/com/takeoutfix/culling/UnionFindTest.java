package com.takeoutfix.culling;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static com.takeoutfix.culling.CullingScanService.hammingDistance;
import static org.junit.jupiter.api.Assertions.*;

@DisplayName("UnionFind Tests")
class UnionFindTest {

    @Test
    @DisplayName("Initially all elements are their own root")
    void testInitialState() {
        UnionFind uf = new UnionFind(5);
        for (int i = 0; i < 5; i++) {
            assertEquals(i, uf.find(i));
        }
    }

    @Test
    @DisplayName("Union merges two sets into one root")
    void testUnion() {
        UnionFind uf = new UnionFind(4);
        assertTrue(uf.union(0, 1));
        assertEquals(uf.find(0), uf.find(1));
    }

    @Test
    @DisplayName("Re-union returns false (already same set)")
    void testDoubleUnion() {
        UnionFind uf = new UnionFind(4);
        uf.union(0, 1);
        assertFalse(uf.union(0, 1));
        assertFalse(uf.union(1, 0));
    }

    @Test
    @DisplayName("Transitive union: 0-1, 1-2 → all same root")
    void testTransitiveUnion() {
        UnionFind uf = new UnionFind(5);
        uf.union(0, 1);
        uf.union(1, 2);
        assertEquals(uf.find(0), uf.find(2));
        assertNotEquals(uf.find(0), uf.find(3));
    }

    @Test
    @DisplayName("getGroups returns correct membership lists")
    void testGetGroups() {
        UnionFind uf = new UnionFind(5);
        uf.union(0, 2);
        uf.union(0, 4);

        Map<Integer, List<Integer>> groups = uf.getGroups();
        long largeGroups = groups.values().stream().filter(g -> g.size() > 1).count();
        assertEquals(1, largeGroups);

        List<Integer> bigGroup = groups.values().stream().filter(g -> g.size() > 1).findFirst().orElseThrow();
        assertEquals(3, bigGroup.size());
        assertTrue(bigGroup.containsAll(List.of(0, 2, 4)));
    }

    @Test
    @DisplayName("Hamming distance: identical hashes → 0")
    void testHammingDistanceIdentical() {
        assertEquals(0, hammingDistance(0xDEADBEEFCAFEBABEL, 0xDEADBEEFCAFEBABEL));
    }

    @Test
    @DisplayName("Hamming distance: one bit flip → 1")
    void testHammingDistanceOneBit() {
        long a = 0b1010L;
        long b = 0b1011L; // bit 0 flipped
        assertEquals(1, hammingDistance(a, b));
    }

    @Test
    @DisplayName("Hamming distance: all bits different → 64")
    void testHammingDistanceAllDifferent() {
        assertEquals(64, hammingDistance(0L, -1L));
    }
}
