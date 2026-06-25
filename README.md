# @renderorange/jest-prove-reporter

A Jest reporter that produces output reminiscent of Perl's prove test harness — terse, scannable, and easy to diff.

## Why?

Jest's default reporter is friendly but verbose. If prefer Perl's prove-style summaries this reporter shows you one line per test file with a clear pass/fail and runtime, then a final summary at the end.

## Example Output

Compact mode (default):

```
foo.test.js ............... ok  500 ms
bar.test.js ............... ok  1.5 s
fail.test.js .............. not ok  200 ms

Test Summary Report
-------------------
fail.test.js (Wstat: 1)
Files=3, Tests=4, 2.2 s
Result: FAIL
```

Verbose mode delegates to jest-tap-reporter and emits full TAP output.

## Installation

```
npm install --save-dev @renderorange/jest-prove-reporter
```

## Usage

Add the reporter to your Jest config:

```
{
  "jest": {
    "reporters": ["@renderorange/jest-prove-reporter"]
  }
}
```

Or on the command line:

```
jest --reporters=@renderorange/jest-prove-reporter
```

## Configuration

The reporter accepts a verbose option. Priority is: reporter option → Jest's globalConfig.verbose → VERBOSE environment variable.

```
{
  "jest": {
    "reporters": [
      ["@renderorange/jest-prove-reporter", { "verbose": true }]
    ]
  }
}
```

## License

MIT
