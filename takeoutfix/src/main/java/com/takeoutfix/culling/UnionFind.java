package com.takeoutfix.culling;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Weighted path-compressed Union-Find (Disjoint Set Union).
 * Used to merge photo indices that pass the dHash + ORB similarity test into burst groups.
 * All operations run in near-O(1) amortised time via path compression and union-by-rank.
 */
public final class UnionFind {

    private final int[] parent;
    private final int[] rank;
    private final int n;

    public UnionFind(int n) {
        this.n = n;
        this.parent = new int[n];
        this.rank = new int[n];
        for (int i = 0; i < n; i++) {
            parent[i] = i;
        }
    }

    /** Returns the representative root for element {@code i}. */
    public int find(int i) {
        if (parent[i] != i) {
            parent[i] = find(parent[i]); // path compression
        }
        return parent[i];
    }

    /**
     * Merges the sets containing {@code a} and {@code b}.
     * Returns true if they were previously disjoint (a new union occurred).
     */
    public boolean union(int a, int b) {
        int ra = find(a);
        int rb = find(b);
        if (ra == rb) return false;
        if (rank[ra] < rank[rb]) { int tmp = ra; ra = rb; rb = tmp; }
        parent[rb] = ra;
        if (rank[ra] == rank[rb]) rank[ra]++;
        return true;
    }

    /**
     * Returns a map from root → list of member indices.
     * Only roots with ≥ 2 members form actual burst groups.
     */
    public Map<Integer, List<Integer>> getGroups() {
        Map<Integer, List<Integer>> groups = new HashMap<>();
        for (int i = 0; i < n; i++) {
            groups.computeIfAbsent(find(i), k -> new ArrayList<>()).add(i);
        }
        return groups;
    }
}
