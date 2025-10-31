"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TestMockupsDataPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testGoogleSheets = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/test/check-google-sheets-mockups");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || "Failed to test");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const testCache = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/test/check-cache-table");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || "Failed to test");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const syncData = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/designer-mockups-cache", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          designers: ["Vitor", "Felipe"],
          forceSync: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || "Failed to sync");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const checkCacheForDate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        "/api/designer-mockups-cache?designers=Vitor,Felipe&startDate=2025-10-30&endDate=2025-10-30"
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || "Failed to check cache");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Test Mockups Data</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>1. Test Google Sheets Connection</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Check what data is being read from the Google Sheets &quot;Mockups
              Feitos&quot; tab
            </p>
            <Button onClick={testGoogleSheets} disabled={loading}>
              {loading ? "Testing..." : "Test Google Sheets"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Sync Data to Cache</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Sync data from Google Sheets to the Supabase cache
            </p>
            <Button onClick={syncData} disabled={loading}>
              {loading ? "Syncing..." : "Sync Data"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Check Cache Table</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Check what data is in the Supabase cache table
            </p>
            <Button onClick={testCache} disabled={loading}>
              {loading ? "Checking..." : "Check Cache"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Check Oct 30, 2025 Data</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Check cache for October 30, 2025 data for Vitor and Felipe
            </p>
            <Button onClick={checkCacheForDate} disabled={loading}>
              {loading ? "Checking..." : "Check Oct 30 Data"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm overflow-auto">{error}</pre>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm overflow-auto max-h-[600px] bg-muted p-4 rounded">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
