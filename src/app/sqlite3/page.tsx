"use client";

import {
  FormEventHandler,
  startTransition,
  useActionState,
  useCallback,
  useState,
} from "react";
import type { Sqlite3Static } from "@sqlite.org/sqlite-wasm";

type ActionState = unknown;

type ActionInput = {
  sql: string;
  data: unknown[];
  onresult: (row: unknown) => void;
};

async function sqlite3InitModule(): Promise<Sqlite3Static> {
  const { default: sqlite3InitModule } = await import(
    "@sqlite.org/sqlite-wasm"
  );

  const sqlite3 = await sqlite3InitModule();
  return sqlite3;
}

let sqlite3: Sqlite3Static | undefined;

async function action(
  state: ActionState,
  input: ActionInput,
): Promise<ActionState> {
  ((..._: unknown[]) => _)(state); // drop

  sqlite3 ??= await sqlite3InitModule();

  const db = new sqlite3.oo1.DB(":memory:", "c");
  try {
    db.exec("CREATE TABLE log (data JSONB)");

    const statement = db.prepare("INSERT INTO log VALUES(?)");
    for (const data of input.data) {
      statement.bind(JSON.stringify(data)).stepReset();
    }
    statement.finalize();

    const result = db.exec(input.sql, {
      returnValue: "resultRows",
      rowMode: "object",
    });
    for (const row of result) {
      input.onresult(row);
    }

    return;
  } finally {
    db.close();
  }
}

export default function Home() {
  const [sql, setSql] = useState(
    "SELECT data->'$.col1' as col1, data->'$.col1' * 2  as col12 FROM log",
  );
  const [data, setData] = useState(JSON.stringify([
    { "col1": 1, "col2": "foo" },
    { "col1": 2, "col2": "bar" },
  ]));
  const [result, setResult] = useState("");
  const [state, dispatch] = useActionState(action, void 0);

  const handleClicked = useCallback<FormEventHandler>(
    (event) =>
      startTransition(() => {
        event.preventDefault();

        setResult("");

        const json = JSON.parse(data);
        dispatch({
          sql,
          data: Array.isArray(json) ? json : [json],
          onresult: (row) =>
            setResult((prev) => prev + "\n" + JSON.stringify(row)),
        });
      }),
    [sql, data],
  );

  ((..._: unknown[]) => _)(state); // drop

  return (
    <>
      <form onSubmit={handleClicked}>
        <label>
          SQL{" "}
          <textarea value={sql} onChange={(evt) => setSql(evt.target.value)} />
        </label>
        <label>
          JSON{" "}
          <textarea
            value={data}
            onChange={(evt) => setData(evt.target.value)}
          />
        </label>
        <button>Evaluate</button>
      </form>
      <output>
        <pre>{result}</pre>
      </output>
    </>
  );
}
