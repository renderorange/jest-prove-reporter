"use strict";

const TapReporter = require("jest-tap-reporter");
const fs = require("fs");
const path = require("path");

const IGNORE_DIRS = new Set(["node_modules", ".git"]);

function find_test_files (dir) {
    const files = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue;
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
    constructor (globalConfig, options) {
        this._globalConfig = globalConfig;
        this._options = options || {};
        this._verbose = this._options.verbose !== undefined
            ? this._options.verbose
            : (globalConfig.verbose !== undefined
                ? globalConfig.verbose
                : !!process.env.VERBOSE);
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

    _compute_max_name_length (roots) {
        let max = 0;
        for (const root of roots) {
            for (const name of find_test_files(root)) {
                if (name.length > max) max = name.length;
            }
        }
        return max > 0 ? max : 30;
    }

    onRunStart (results, options) {
        if (this._tap) {
            this._tap.onRunStart(results, options || {});
        }
    }

    _failure_details (failures) {
        const lines = [];
        for (const f of failures) {
            const fullName = f.ancestorTitles && f.ancestorTitles.length > 0
                ? f.ancestorTitles.join(" > ") + " > " + f.title
                : f.title;
            lines.push("#   Failed test: " + fullName + "\n");
            if (f.failureMessages && f.failureMessages.length > 0) {
                for (const msg of f.failureMessages) {
                    const firstLine = msg.split("\n")[0];
                    lines.push("#       " + firstLine + "\n");
                }
            }
        }
        return lines;
    }

    onTestResult (test, testResult) {
        if (!this._started) {
            this._started = true;
        }

        if (this._tap) {
            this._tap.onTestResult(test, testResult);
            return;
        }

        const testPath = test.path;
        const name = testPath.split("/")
            .pop();
        const passed = testResult.numFailingTests === 0;
        const duration = testResult.perfStats ? testResult.perfStats.runtime : 0;

        const failures = passed ? [] : (testResult.testResults || []).filter((r) => r.status === "failed");
        this._results.push({ name, passed, duration, failures });
        this._totalTime += duration;

        const pad = this._maxNameLength + 2;
        const dots = ".".repeat(Math.max(0, pad - name.length));
        const status = passed ? "ok" : "not ok";
        const time = this._formatTime(duration);
        process.stdout.write(name + " " + dots + " " + status + "  " + time + "\n");

        if (!passed && failures.length > 0) {
            for (const line of this._failure_details(failures)) {
                process.stdout.write(line);
            }
        }
    }

    _formatTime (ms) {
        if (ms >= 1000) {
            return (ms / 1000).toFixed(1) + " s";
        }
        return Math.round(ms) + " ms";
    }

    onRunComplete (contexts, results) {
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
                if (r.failures && r.failures.length > 0) {
                    for (const f of r.failures) {
                        const fullName = f.ancestorTitles && f.ancestorTitles.length > 0
                            ? f.ancestorTitles.join(" > ") + " > " + f.title
                            : f.title;
                        process.stdout.write("  Failed test: " + fullName + "\n");
                    }
                }
            }
        }

        process.stdout.write(
            "Files=" + this._results.length + ", Tests=" + results.numPassedTests + ", " + this._formatTime(this._totalTime) + "\n",
        );
        process.stdout.write("Result: " + (failed.length === 0 ? "PASS" : "FAIL") + "\n");
    }
}

module.exports = ProveReporter;
