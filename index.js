"use strict";

const TapReporter = require("jest-tap-reporter");
const fs = require("fs");
const path = require("path");

function find_test_files(dir) {
    const files = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...find_test_files(full));
            } else if (entry.name.endsWith(".test.js")) {
                files.push(entry.name);
            }
        }
    } catch (_) {
        // directory may not exist
    }
    return files;
}

class ProveReporter {
    constructor(globalConfig, options) {
        this._globalConfig = globalConfig;
        this._options = options || {};
        this._verbose = !!process.env.VERBOSE;
        this._results = [];
        this._started = false;
        this._totalTime = 0;

        if (this._verbose) {
            this._tap = new TapReporter(globalConfig, { logLevel: "ERROR" });
            this._maxNameLength = 0;
        } else {
            this._maxNameLength = this._compute_max_name_length(globalConfig.roots || []);
        }
    }

    _compute_max_name_length(roots) {
        let max = 0;
        for (const root of roots) {
            for (const name of find_test_files(root)) {
                if (name.length > max) max = name.length;
            }
        }
        return max > 0 ? max : 30;
    }

    onRunStart(results, options) {
        if (this._tap) {
            this._tap.onRunStart(results, options || {});
        }
    }

    onTestResult(test, testResult) {
        if (!this._started) {
            this._started = true;
        }

        if (this._tap) {
            this._tap.onTestResult(test, testResult);
            return;
        }

        const testPath = test.path;
        const name = testPath.split("/").pop();
        const passed = testResult.numFailingTests === 0;
        const duration = testResult.perfStats ? testResult.perfStats.runtime : 0;

        this._results.push({ name, passed, duration });
        this._totalTime += duration;

        const pad = this._maxNameLength + 2;
        const dots = ".".repeat(Math.max(0, pad - name.length));
        const status = passed ? "ok" : "not ok";
        const time = this._formatTime(duration);
        process.stdout.write(name + " " + dots + " " + status + "  " + time + "\n");
    }

    _formatTime(ms) {
        if (ms >= 1000) {
            return (ms / 1000).toFixed(1) + " s";
        }
        return Math.round(ms) + " ms";
    }

    onRunComplete(contexts, results) {
        if (this._tap) {
            this._tap.onRunComplete(contexts, results);
            return;
        }

        process.stdout.write("\n");

        const failed = this._results.filter((r) => !r.passed);

        if (failed.length > 0) {
            process.stdout.write("Test Summary Report\n");
            process.stdout.write("-------------------\n");
            for (const r of failed) {
                process.stdout.write(r.name + " (Wstat: 1)\n");
            }
        }

        process.stdout.write(
            "Files=" + this._results.length + ", Tests=" + results.numPassedTests + ", " + this._formatTime(this._totalTime) + "\n",
        );
        process.stdout.write("Result: " + (failed.length === 0 ? "PASS" : "FAIL") + "\n");
    }
}

module.exports = ProveReporter;
