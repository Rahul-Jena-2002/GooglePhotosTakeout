package com.takeoutfix.restore.infrastructure;

import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.function.BooleanSupplier;

final class WorkerCompletion {
    private WorkerCompletion() {}

    static void await(List<CompletableFuture<Void>> workers, BooleanSupplier cancelled) {
        try {
            CompletableFuture.allOf(workers.toArray(new CompletableFuture[0])).join();
        } catch (CancellationException e) {
            if (!cancelled.getAsBoolean()) throw e;
        } catch (CompletionException e) {
            if (!cancelled.getAsBoolean() || !(e.getCause() instanceof CancellationException)) throw e;
        }
    }
}
