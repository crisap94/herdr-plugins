import { a, ed, rd, sh, u } from './pools.ts';
import type { E } from './pools.ts';

export const MORE: Readonly<Record<string, readonly (readonly E[])[]>> = {
    orchard: [
        [
            u('Walk me through what happens to a request between the socket and the route handler. I keep losing track of which middleware runs when, and I need to know before I add anything new to that chain.'),
            rd('src/server.ts'),
            rd('src/middleware/index.ts'),
            a('In order, for every request. First the server assigns a request id and starts a timer. Second, the body parser reads JSON bodies up to 1 MB and rejects anything larger with a 413 before any of our code sees it. Third, the authentication middleware looks for the API key in the Authorization header, loads the key record through the repository layer and attaches the account to the request; a missing or unknown key ends the request with a 401 here. Fourth, the validation middleware checks the path, query and body against the schema that the route declared and answers 422 with the list of problems when they do not match. Fifth, the route handler runs and returns a plain object. Sixth, on the way out, the serializer turns that object into JSON, the timer stops, and one line is written with the request id, the status and the time taken. An error thrown anywhere jumps to the error handler, which maps known error classes to their status codes and turns everything else into a 500 without leaking the message. So a new middleware that needs the account must sit after the third step, and one that must see every request, even rejected ones, must sit before it. I changed nothing; this is a description of src/server.ts as it is.'),
        ],
        [
            u('The test run eats more and more memory, by the end my laptop swaps. Find out why, and fix it if it is something in our test setup rather than in the code under test.'),
            sh('bun test --heap-snapshot-on-exit', 'heap at exit: 1.9 GB, 412 live Server objects'),
            rd('test/helpers/http.ts'),
            ed('test/helpers/http.ts'),
            sh('bun test', '412 pass, 0 fail, 3 skip; peak memory 310 MB'),
            a('It was the test setup. The helper that starts a throwaway HTTP server for a test never stopped it: every test that asked for a server left one running until the end of the run, and each kept its own connection pool and its own copy of the seeded data in memory. The heap snapshot showed 412 live servers at exit, one per test. The helper now registers a cleanup that stops the server and closes its pool when the test finishes, whether it passed or failed. With that, peak memory of the whole run dropped from about 1.9 GB to 310 MB and the run is 40 seconds shorter, because the machine no longer swaps near the end. The code under test was not involved and is unchanged. One thing to know: two tests relied on the leak by reusing the server of the test before them; I gave each of them its own server, which is what they should have had from the start.'),
        ],
        [
            u('How is the configuration loaded and checked at start-up? Yesterday the service started with an empty database URL and only failed on the first query, which is far too late.'),
            rd('src/config.ts'),
            a('Today the configuration module reads each value from the environment at the moment some code first asks for it, and it treats a missing value as an empty string. That is why the service started: nothing asked for the database URL until the first query. There is a schema in src/config.ts that lists every variable with its type and whether it is required, but it is only used by the command that prints the configuration, not at start-up. The fix would be small: validate the whole environment against that schema once, before the server starts to listen, and exit with a message that names every missing or malformed variable. Start-up would then fail in under a second with a clear list instead of failing later on a query. Two variables would need a decision first, because the schema marks them required while the code has a fallback for them: the port and the log level. I have not changed anything yet; say the word and I will wire the validation in and settle those two with you.'),
        ],
        [
            u('A customer in another time zone got a payment reminder a day early. Explain how the reminder dates are computed, before we decide whether that is a bug or a matter of definition.'),
            rd('src/reminders/schedule.ts'),
            sh('bun test test/reminders', '31 pass, 0 fail'),
            a('The reminder job runs once an hour and selects the invoices whose due date is "three days from today". The due date is stored as a calendar date without a time, which is right. The problem is the word today: the job takes the current date in UTC, not in the time zone of the customer. For a customer eleven hours ahead of UTC the local date changes at 13:00 UTC, so between 13:00 and midnight UTC the job and the customer disagree about what day it is, and for a customer behind UTC the same happens in the other direction. That customer got the reminder on what was, for them, four days before the due date. So it is a real defect of definition rather than a miscalculation: the arithmetic is right for someone living in UTC. The account record already has a time zone field that the invoice PDF uses. Using it in the reminder query is a contained change, and the 31 existing tests would keep passing because they all use UTC accounts; new tests would be needed for accounts ahead of and behind UTC. Nothing is changed so far.'),
        ],
        [
            u('I need to add a repository class for a new table next week. Show me the pattern by pointing at an existing one, so I copy the right things and not the historical accidents.'),
            rd('src/repositories/customers.ts'),
            rd('src/repositories/base.ts'),
            a('Use src/repositories/customers.ts as the model; it is the newest and the cleanest. The pattern has four parts. One: the class takes a database handle in its constructor and never imports the global pool, which is what lets a test hand it a transaction that is rolled back afterwards. Two: every public method returns domain objects built by one private function at the bottom of the file, so column names appear in exactly one place. Three: methods that write accept an optional transaction and otherwise open their own; nothing commits on behalf of a caller. Four: lists take a cursor and a limit and return the items plus the next cursor, using the shared helper, never an offset. The historical accidents to leave behind are in the older files: a method there that returns raw rows, a cache that lives inside the repository, and a method that takes a whole request object. For the test, copy test/repositories/customers.test.ts: it shows the transaction fixture and the factory helpers. That is all there is to it; I have not created any file.'),
        ],
        [
            u('What does the CI pipeline do stage by stage, and where does the time go? It takes about 14 minutes now and people have started to merge without waiting for it.'),
            sh('ci stats --pipeline api --last 20', 'install 3 m 10 s, lint 1 m 05 s, types 1 m 40 s, test 6 m 30 s, build 1 m 50 s'),
            a('Five stages, run one after another. Install takes a little over 3 minutes because the dependency cache is keyed on the commit, so it is never hit; keyed on the lockfile it would be hit on almost every run. Lint and the type check take about 1 and 2 minutes and do not depend on each other, so they could run side by side. The tests take 6 and a half minutes on a single runner; they are already independent of each other, so splitting them over three runners would bring that to a little over 2 minutes plus start-up. The build takes about 2 minutes and only needs to run when the earlier stages pass. Put together: caching on the lockfile, lint and types in parallel and three test runners would bring the pipeline from about 14 minutes to roughly 6, without removing any check. None of this is changed yet; it is the measurement of the last 20 runs and what follows from it. The cheapest single step is the cache key, which is a one-line change in the pipeline file.'),
        ],
    ],
    tidewater: [
        [
            u('How are the sample folders produced? I want a fourth one with returns in it and I do not want to build it by hand.'),
            rd('tools/make_samples.py'),
            a('The samples come from tools/make_samples.py. It takes a seed, a number of orders and a "shape" and writes a folder of files in the same layout as the real feed, with invented customers and products. The shape decides the mix: small makes 200 orders with one to three lines each, medium makes 20,000 with the same mix, and wide makes 300 orders with up to 400 lines each to stress the line parser. Every run with the same seed gives the same files, byte for byte, which is what keeps the tests stable. Returns are not generated today: the script has a place for them, a function that is declared and raises "not implemented". A fourth shape would need that function written, which means deciding what share of orders is returned and after how many days, and writing the returns file in the layout the feed documentation describes. It is perhaps fifty lines. I have not written it; tell me the share and the delay you want and I will add the shape and a folder generated from it.'),
        ],
        [
            u('Suppose we get a new source table next quarter. What are the steps to bring it into the pipeline? I want to estimate the work.'),
            rd('docs/adding-a-table.md'),
            rd('pipeline/registry.py'),
            a('Six steps, going by the document and by what the code really requires. One: describe the table in pipeline/registry.py with its name, key columns and the column that tells when a row changed. Two: write the staging definition under ddl/staging, key columns first. Three: write the transform, which is usually a list of column renames and type casts; only tables with nested data, such as order lines, need real code. Four: add the table to the row count check so that a load that loses rows is caught. Five: generate sample files for it and add at least the tests that every table has, which are a load of the small sample and a second load of the same sample that must change nothing. Six: add it to the scheduler job after the tables it depends on. For a flat table this is about a day including review. For a table with nested data, count three days, most of it in the transform and its tests. The document is accurate except that it does not mention the fourth step; I can add that paragraph if you like, but have not.'),
        ],
        [
            u('The unit tests take a minute and a half, which is long for what they do. See whether something silly is going on.'),
            sh('pytest --durations=5 -q', '94.2s total; setup of db fixture: 0.38s x 214 tests'),
            ed('tests/conftest.py'),
            sh('pytest -q', '214 passed in 21.6s'),
            a('Something silly was going on: the fixture that provides the local stand-in database created a new database file and ran every definition file for each single test, 214 times, at about 0.4 seconds each. Most tests only read from it. The fixture now builds the database once per test module and gives each test a transaction that is rolled back at the end, so tests still cannot see each other\'s rows. The run went from 94 seconds to under 22, with the same 214 tests passing. Three tests needed their own fresh database because they test the definition files themselves; they ask for it explicitly now through a second fixture. Nothing outside the tests folder changed.'),
        ],
        [
            u('There are tables called stg_something and others called staging_something. Is there a rule, or did that just happen?'),
            sh('rg -o "(stg|staging)_[a-z_]+" ddl/ -N --no-filename | sort -u', 'staging_order_lines\nstaging_orders\nstaging_returns\nstg_products\nstg_stores'),
            a('It just happened, and it follows the age of the tables. The three tables of the orders feed use the long prefix staging_ and were written first. The two reference tables, products and stores, came later from another feed and use the short prefix stg_. Nothing in the code depends on the prefix: every table is looked up by the name given in the registry, so both spellings work. The naming section of the conventions document says staging_ and gives no reason for exceptions. Renaming the two short ones would be a change in two definition files, two registry entries and four queries of the reports; because staging tables are created fresh on every run, there is no data to move. It is a tidy-up, not a repair, so I have left it alone until you say you want it.'),
        ],
        [
            u('Read the README of the pipeline as if you were new here and tell me what is wrong with it. Fix what is plainly out of date, leave questions of taste to me.'),
            rd('README.md'),
            ed('README.md'),
            a('Read as a newcomer, three things were plainly out of date and are fixed. The install section named a requirements file that no longer exists; it now names the lock file and the one command that installs from it. The section on running a step used the old command name; it now shows the make target with the STEP and SAMPLE variables. The list of folders was missing tools and checks and still listed a notebooks folder that was deleted in the summer. Two things are matters of taste and are untouched: the README opens with the history of the project rather than with what the pipeline does, and the troubleshooting section is longer than everything else together. One thing is missing and I did not invent it: there is no word on who to ask when a run fails outside working hours.'),
        ],
        [
            u('How do credentials reach the pipeline when I run it locally? I do not want to paste anything into my shell history.'),
            rd('pipeline/credentials.py'),
            a('Locally the pipeline never reads credentials from the command line. It asks the keyring of the operating system for an entry named tidewater-local, and when that entry does not exist it uses the stand-in database and the sample files, which need no credentials at all. So the default local run is safe by construction: without the keyring entry nothing can reach a real system. To work against the staging warehouse you store the entry once with the tw login command, which asks for the value on a prompt that does not echo and writes it only to the keyring. Production is not reachable from a local run in any case: the client refuses the production address unless it runs under the scheduler identity. Nothing needs to be pasted into a shell, and nothing changed in the code; this is how pipeline/credentials.py works today.'),
        ],
    ],
};
