"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const ProveReporter = require("../index");

function make_test (fileName, numFailingTests, runtime) {
    return {
        path: `/path/to/${fileName}`,
    };
}

function make_test_result (numFailingTests, runtime) {
    const r = { numFailingTests };
    if (runtime !== undefined) {
        r.perfStats = { runtime };
    }
    return r;
}

function make_full_test_result (fileName, numFailingTests, runtime) {
    return {
        numFailingTests,
        testFilePath: `/path/to/${fileName}`,
        testResults: [],
        testExecError: null,
        perfStats: { runtime: runtime || 0 },
    };
}

function mock_stdout () {
    const calls = [];
    const orig = process.stdout.write;
    process.stdout.write = (s) => calls.push(s);
    return {
        restore: () => { process.stdout.write = orig; },
        calls,
    };
}

let tmpDir;
let tmpDirCounter = 0;

function make_tmp_dir () {
    tmpDirCounter++;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `jest-prove-test-${tmpDirCounter}-`));
    return dir;
}

function cleanup_tmp_dir (dir) {
    if (!dir) return;
    fs.rmSync(dir, { recursive: true, force: true });
}

describe("ProveReporter", () => {
    afterEach(() => {
        delete process.env.VERBOSE;
    });

    describe("constructor", () => {
        it("stores options and initializes defaults", () => {
            const reporter = new ProveReporter({ roots: [] }, { foo: 1 });
            expect(reporter._globalConfig)
                .toEqual({ roots: [] });
            expect(reporter._options)
                .toEqual({ foo: 1 });
            expect(reporter._results)
                .toEqual([]);
            expect(reporter._totalTime)
                .toBe(0);
            expect(reporter._started)
                .toBe(false);
        });

        it("defaults options to empty object when not provided", () => {
            const reporter = new ProveReporter({ roots: [] });
            expect(reporter._options)
                .toEqual({});
        });

        it("uses VERBOSE env var when set", () => {
            process.env.VERBOSE = "1";
            const reporter = new ProveReporter({ roots: [] }, {});
            expect(reporter._verbose)
                .toBe(true);
            expect(reporter._tap)
                .toBeTruthy();
        });

        it("uses reporter options.verbose over env var", () => {
            process.env.VERBOSE = "1";
            const reporter = new ProveReporter({ verbose: false }, {});
            expect(reporter._verbose)
                .toBe(false);
        });

        it("computes max name length from roots in compact mode", () => {
            const reporter = new ProveReporter({ roots: [] }, {});
            expect(reporter._maxNameLength)
                .toBeGreaterThanOrEqual(30);
        });

        it("sets max name length to 0 in verbose mode", () => {
            const reporter = new ProveReporter({ verbose: true }, {});
            expect(reporter._maxNameLength)
                .toBe(0);
        });
    });

    describe("_compute_max_name_length", () => {
        it("returns 30 when no roots are given", () => {
            const reporter = new ProveReporter({ roots: [] }, {});
            const result = reporter._compute_max_name_length([]);
            expect(result)
                .toBe(30);
        });

        it("returns 30 when roots have no test files", () => {
            const dir = make_tmp_dir();
            try {
                const reporter = new ProveReporter({ roots: [] }, {});
                const result = reporter._compute_max_name_length([dir]);
                expect(result)
                    .toBe(30);
            } finally {
                cleanup_tmp_dir(dir);
            }
        });

        it("finds longest test file name across roots", () => {
            const dir = make_tmp_dir();
            try {
                fs.writeFileSync(path.join(dir, "a.test.js"), "");
                fs.writeFileSync(path.join(dir, "longer-name.test.js"), "");
                fs.writeFileSync(path.join(dir, "x.txt"), "");

                const reporter = new ProveReporter({ roots: [] }, {});
                const result = reporter._compute_max_name_length([dir]);
                expect(result)
                    .toBe("longer-name.test.js".length);
            } finally {
                cleanup_tmp_dir(dir);
            }
        });

        it("finds longest name across multiple roots", () => {
            const dir1 = make_tmp_dir();
            const dir2 = make_tmp_dir();
            try {
                fs.writeFileSync(path.join(dir1, "short.test.js"), "");
                fs.writeFileSync(path.join(dir2, "very-long-name-here.test.js"), "");

                const reporter = new ProveReporter({ roots: [] }, {});
                const result = reporter._compute_max_name_length([dir1, dir2]);
                expect(result)
                    .toBe("very-long-name-here.test.js".length);
            } finally {
                cleanup_tmp_dir(dir1);
                cleanup_tmp_dir(dir2);
            }
        });

        it("recurses into subdirectories", () => {
            const dir = make_tmp_dir();
            try {
                const sub = fs.mkdtempSync(path.join(dir, "sub-"));
                fs.writeFileSync(path.join(sub, "nested.test.js"), "");

                const reporter = new ProveReporter({ roots: [] }, {});
                const result = reporter._compute_max_name_length([dir]);
                expect(result)
                    .toBe("nested.test.js".length);
            } finally {
                cleanup_tmp_dir(dir);
            }
        });

        it("skips node_modules and .git directories", () => {
            const dir = make_tmp_dir();
            try {
                const nm = path.join(dir, "node_modules");
                const git = path.join(dir, ".git");
                fs.mkdirSync(nm, { recursive: true });
                fs.mkdirSync(git, { recursive: true });
                fs.writeFileSync(path.join(nm, "dep.test.js"), "");
                fs.writeFileSync(path.join(git, "hook.test.js"), "");
                fs.writeFileSync(path.join(dir, "real.test.js"), "");

                const reporter = new ProveReporter({ roots: [] }, {});
                const result = reporter._compute_max_name_length([dir]);
                expect(result)
                    .toBe("real.test.js".length);
            } finally {
                cleanup_tmp_dir(dir);
            }
        });
    });

    describe("onRunStart", () => {
        it("is a no-op in compact mode", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            reporter.onRunStart({}, {});
            expect(mock.calls.length)
                .toBe(0);
            mock.restore();
        });

        it("delegates to TapReporter in verbose mode", () => {
            const reporter = new ProveReporter({ verbose: true }, {});
            expect(reporter._tap)
                .toBeTruthy();
            expect(() => {
                reporter.onRunStart({ numTotalTestSuites: 1 }, {});
            }).not.toThrow();
        });
    });

    describe("onTestResult", () => {
        it("extracts filename from path with various separators", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            const test = { path: "C:\\\\windows\\\\style.test.js" };
            reporter.onTestResult(test, make_test_result(0, 10));
            reporter.onRunComplete({}, { numPassedTests: 1 });
            const output = mock.calls.join("");
            expect(output)
                .toContain("style.test.js");
            mock.restore();
        });

        it("handles missing perfStats by defaulting duration to 0", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            const test = { path: "/foo/zero.test.js" };
            reporter.onTestResult(test, { numFailingTests: 0 });
            reporter.onRunComplete({}, { numPassedTests: 1 });
            const output = mock.calls.join("");
            expect(output)
                .toContain("0 ms");
            mock.restore();
        });

        it("outputs failure diagnostics after not ok line", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            const test = { path: "/foo/fail.test.js" };
            const testResult = {
                numFailingTests: 1,
                perfStats: { runtime: 200 },
                testResults: [
                    {
                        title: "should add numbers",
                        ancestorTitles: [],
                        status: "failed",
                        failureMessages: ["Error: Expected 5 to equal 4\n    at file.js:12"],
                        failureDetails: [],
                    },
                    {
                        title: "should handle edge case",
                        ancestorTitles: ["Edge cases"],
                        status: "failed",
                        failureMessages: ["Error: Expected true to be false\n    at edge.js:5"],
                        failureDetails: [],
                    },
                ],
            };
            reporter.onTestResult(test, testResult);
            const output = mock.calls.join("");
            expect(output)
                .toContain("not ok  200 ms\n");
            expect(output)
                .toContain("#   Failed test: should add numbers");
            expect(output)
                .toContain("#       Error: Expected 5 to equal 4");
            expect(output)
                .toContain("#   Failed test: Edge cases > should handle edge case");
            expect(output)
                .toContain("#       Error: Expected true to be false");
            mock.restore();
        });

        it("does not output failure diagnostics for passing tests", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            const test = { path: "/foo/pass.test.js" };
            const testResult = {
                numFailingTests: 0,
                perfStats: { runtime: 100 },
                testResults: [
                    { title: "works", ancestorTitles: [], status: "passed" },
                ],
            };
            reporter.onTestResult(test, testResult);
            const output = mock.calls.join("");
            expect(output)
                .not.toContain("#");
            mock.restore();
        });
    });

    describe("_failure_details", () => {
        it("formats failure details with # prefix", () => {
            const reporter = new ProveReporter({ roots: [] }, {});
            const failures = [
                {
                    title: "should add",
                    ancestorTitles: [],
                    status: "failed",
                    failureMessages: ["Error: Expected 5 to equal 4\n    at file.js:12"],
                },
                {
                    title: "should subtract",
                    ancestorTitles: ["Math"],
                    status: "failed",
                    failureMessages: ["AssertionError: Expected 2 to equal 3\n    at math.js:8"],
                },
            ];
            const lines = reporter._failure_details(failures);
            expect(lines[0])
                .toBe("#   Failed test: should add\n");
            expect(lines[1])
                .toBe("#       Error: Expected 5 to equal 4\n");
            expect(lines[2])
                .toBe("#   Failed test: Math > should subtract\n");
            expect(lines[3])
                .toBe("#       AssertionError: Expected 2 to equal 3\n");
        });

        it("handles missing ancestorTitles gracefully", () => {
            const reporter = new ProveReporter({ roots: [] }, {});
            const failures = [
                {
                    title: "plain test",
                    status: "failed",
                    failureMessages: [],
                },
            ];
            const lines = reporter._failure_details(failures);
            expect(lines[0])
                .toBe("#   Failed test: plain test\n");
        });

        it("handles missing failureMessages gracefully", () => {
            const reporter = new ProveReporter({ roots: [] }, {});
            const failures = [
                {
                    title: "no details",
                    ancestorTitles: [],
                    status: "failed",
                },
            ];
            const lines = reporter._failure_details(failures);
            expect(lines[0])
                .toBe("#   Failed test: no details\n");
            expect(lines.length)
                .toBe(1);
        });

        it("handles multiple failure messages per test", () => {
            const reporter = new ProveReporter({ roots: [] }, {});
            const failures = [
                {
                    title: "multi error",
                    ancestorTitles: [],
                    status: "failed",
                    failureMessages: [
                        "Error: First failure\n    at a.js:1",
                        "Error: Second failure\n    at b.js:2",
                    ],
                },
            ];
            const lines = reporter._failure_details(failures);
            expect(lines[0])
                .toBe("#   Failed test: multi error\n");
            expect(lines[1])
                .toBe("#       Error: First failure\n");
            expect(lines[2])
                .toBe("#       Error: Second failure\n");
        });
    });

    describe("_formatTime", () => {
        it("formats 0ms", () => {
            const reporter = new ProveReporter({ roots: [] }, {});
            expect(reporter._formatTime(0))
                .toBe("0 ms");
        });

        it("formats 500ms", () => {
            const reporter = new ProveReporter({ roots: [] }, {});
            expect(reporter._formatTime(500))
                .toBe("500 ms");
        });

        it("formats 999ms", () => {
            const reporter = new ProveReporter({ roots: [] }, {});
            expect(reporter._formatTime(999))
                .toBe("999 ms");
        });

        it("formats exactly 1000ms as 1.0 s", () => {
            const reporter = new ProveReporter({ roots: [] }, {});
            expect(reporter._formatTime(1000))
                .toBe("1.0 s");
        });

        it("formats 1500ms as 1.5 s", () => {
            const reporter = new ProveReporter({ roots: [] }, {});
            expect(reporter._formatTime(1500))
                .toBe("1.5 s");
        });

        it("formats 100000ms as 100.0 s", () => {
            const reporter = new ProveReporter({ roots: [] }, {});
            expect(reporter._formatTime(100000))
                .toBe("100.0 s");
        });
    });

    describe("onRunComplete", () => {
        it("skips Test Summary Report when all tests pass", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            reporter.onTestResult(make_test("a.test.js"), make_test_result(0, 100));
            reporter.onRunComplete({}, { numPassedTests: 1 });
            const output = mock.calls.join("");
            expect(output).not.toContain("Test Summary Report");
            expect(output)
                .toContain("PASS");
            mock.restore();
        });

        it("handles no test results gracefully", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            reporter.onRunComplete({}, { numPassedTests: 0 });
            const output = mock.calls.join("");
            expect(output)
                .toContain("Files=0");
            expect(output)
                .toContain("Tests=0");
            expect(output)
                .toContain("PASS");
            mock.restore();
        });

        it("includes Test Summary Report with failed file details", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            reporter.onTestResult(make_test("fail1.test.js"), make_test_result(2, 300));
            reporter.onTestResult(make_test("fail2.test.js"), make_test_result(1, 100));
            reporter.onRunComplete({}, { numPassedTests: 1 });
            const output = mock.calls.join("");
            expect(output)
                .toContain("Test Summary Report");
            expect(output)
                .toContain("fail1.test.js (Wstat: 1)");
            expect(output)
                .toContain("fail2.test.js (Wstat: 1)");
            expect(output)
                .toContain("FAIL");
            mock.restore();
        });

        it("lists failed test names in summary when failure details available", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            const test = { path: "/foo/fail.test.js" };
            const testResult = {
                numFailingTests: 2,
                perfStats: { runtime: 200 },
                testResults: [
                    {
                        title: "should add",
                        ancestorTitles: [],
                        status: "failed",
                        failureMessages: [],
                        failureDetails: [],
                    },
                    {
                        title: "should subtract",
                        ancestorTitles: ["Math"],
                        status: "failed",
                        failureMessages: [],
                        failureDetails: [],
                    },
                ],
            };
            reporter.onTestResult(test, testResult);
            reporter.onRunComplete({}, { numPassedTests: 0 });
            const output = mock.calls.join("");
            expect(output)
                .toContain("fail.test.js (Wstat: 1)");
            expect(output)
                .toContain("  Failed test: should add");
            expect(output)
                .toContain("  Failed test: Math > should subtract");
            mock.restore();
        });

        it("correctly reports Files count and total time", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            reporter.onTestResult(make_test("t1.test.js"), make_test_result(0, 1000));
            reporter.onTestResult(make_test("t2.test.js"), make_test_result(0, 2000));
            reporter.onRunComplete({}, { numPassedTests: 4 });
            const output = mock.calls.join("");
            expect(output)
                .toContain("Files=2");
            expect(output)
                .toContain("Tests=4");
            expect(output)
                .toContain("3.0 s");
            mock.restore();
        });

        it("includes blank line separator before summary", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            reporter.onTestResult(make_test("t.test.js"), make_test_result(0, 100));
            reporter.onRunComplete({}, { numPassedTests: 1 });
            const output = mock.calls.join("");
            expect(output)
                .toContain("100 ms\n\n");
            mock.restore();
        });
    });

    describe("compact mode (default)", () => {
        it("prints ok lines for passing tests", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            reporter.onTestResult(make_test("pass.test.js"), make_test_result(0, 500));
            reporter.onRunComplete({}, { numPassedTests: 1 });

            const output = mock.calls.join("");
            expect(output)
                .toContain("ok");
            expect(output)
                .toContain("500 ms");
            expect(output)
                .toContain("PASS");
            mock.restore();
        });

        it("prints not ok lines for failing tests", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            reporter.onTestResult(make_test("fail.test.js"), make_test_result(1, 200));
            reporter.onRunComplete({}, { numPassedTests: 0 });

            const output = mock.calls.join("");
            expect(output)
                .toContain("not ok");
            expect(output)
                .toContain("Wstat: 1");
            expect(output)
                .toContain("FAIL");
            mock.restore();
        });

        it("pads output with dots to align filenames", () => {
            const mock = mock_stdout();
            const reporter = new ProveReporter({ roots: [] }, {});
            reporter._maxNameLength = 20;
            reporter.onTestResult(make_test("short-test-js"), make_test_result(0, 100));
            reporter.onRunComplete({}, { numPassedTests: 1 });
            const output = mock.calls.join("");
            expect(output)
                .toContain("short-test-js");
            const line = output.split("\n")[0];
            const dotCount = (line.match(/\./g) || []).length;
            expect(dotCount)
                .toBe(9);
            mock.restore();
        });
    });

    describe("verbose mode", () => {
        const verboseConfig = { rootDir: __dirname, verbose: true };

        it("creates TapReporter instance", () => {
            const reporter = new ProveReporter(verboseConfig, {});
            expect(reporter._tap)
                .toBeTruthy();
            expect(reporter._verbose)
                .toBe(true);
        });

        it("delegates onRunStart to TapReporter", () => {
            const reporter = new ProveReporter(verboseConfig, {});
            const spy = jest.spyOn(reporter._tap, "onRunStart")
                .mockImplementation(() => {});
            reporter.onRunStart({ numTotalTestSuites: 1 }, {});
            expect(spy)
                .toHaveBeenCalledWith({ numTotalTestSuites: 1 }, {});
        });

        it("delegates onTestResult to TapReporter", () => {
            const reporter = new ProveReporter(verboseConfig, {});
            const spy = jest.spyOn(reporter._tap, "onTestResult")
                .mockImplementation(() => {});
            const test = make_test("foo.test.js");
            const testResult = make_full_test_result("foo.test.js", 0, 100);
            reporter.onTestResult(test, testResult);
            expect(spy)
                .toHaveBeenCalledWith(test, testResult);
        });

        it("delegates onRunComplete to TapReporter", () => {
            const reporter = new ProveReporter(verboseConfig, {});
            const spy = jest.spyOn(reporter._tap, "onRunComplete")
                .mockImplementation(() => {});
            reporter.onRunComplete({ contexts: [] }, { numPassedTests: 1 });
            expect(spy)
                .toHaveBeenCalledWith({ contexts: [] }, { numPassedTests: 1 });
        });

        it("does not accumulate results in verbose mode", () => {
            const reporter = new ProveReporter(verboseConfig, {});
            reporter.onTestResult(
                make_test("foo.test.js"),
                make_full_test_result("foo.test.js", 1, 100),
            );
            expect(reporter._results)
                .toEqual([]);
        });
    });
});
