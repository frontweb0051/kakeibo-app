import { Hono } from 'hono'
import { cors } from "hono/cors";
import { env } from "./env.js";
import { Client } from "pg";

const app = new Hono()

app.use(
  "/*",
  cors({
    origin: [env.FRONTEND_URL],
    allowMethods: ["GET","POST", "PUT", "DELETE", "OPTION"],
    allowHeaders: ["Content-Type", "Autorization"],
    credentials: true,
  }),
);


// PostgreSQLクライアントの初期化
const client = new Client({
  host: env.DATABASE_HOST,
  port: env.DATABASE_PORT,
  database: env.DATABASE_NAME,
  user: env.DATABASE_USER,
  password: env.DATABASE_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

// const item = "給料";
// const amount = 200000;
// const date = "2025-12-01";
// await client.query(
//   `INSERT INTO transactions (item,amount,date) VALUES ($1, $2, $3)`,[item,amount,date]
// );

const toYMD = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}

app.get("/transactions", async (c) => {
  const type = c.req.query("type")

  if (!type || !['income','expense','all'].includes(type)) {
    return c.json(
      {message: "typeはincome, expense, allのいずれかである必要があります"},
      400,
    );
  }

  // 履歴取得クエリの共通部分
  let historyQuery = `SELECT id, item, amount, date FROM transactions`;
  // 履歴カウントクエリの共通部分
  let countQuery = `SELECT COUNT(*) as TOTAL FROM transactions`;
  // パラメーターの配列
  const params: string[] = [];

  if (type === "income" || type === "expense") {
    // typeがincomeの場合はamount > 0
    // expenseの場合はamout < 0 の条件をクエリに追加する。
    const addTypeQuery = type === "income" ? ` WHERE amount > 0` : ` WHERE amount < 0`;
    historyQuery += addTypeQuery;
    countQuery += addTypeQuery;
  }

  // 取得順は日付の降順とする
  historyQuery += ` ORDER BY date DESC`;

  // クエリ実行
  const historyResult = await client.query(historyQuery, params);
  const countResult = await client.query(countQuery, params);

  // 取得履歴を作成
  const transactions = historyResult.rows.map((row) => {
    return {
      id: parseInt(row.id),
      item: row.item,
      amount: row.amount,
      date: toYMD(new Date(row.date)),
    };
  });

  const totalAmount = transactions.reduce(
    (sum, transactions) => sum + transactions.amount,0,
  );

  const result = {
    transactions: transactions,
    totalCount: transactions.length,
    totalAmount,
  }
  return c.json(result,200);
})

app.post("/transactions", async (c) => {
  const body = await c.req.json();

  if (body === null || typeof body !== "object" || Array.isArray(body) ) {
    return c.json({message: "本文はオブジェクトで送信してください。"})
  }
  const {item, amount, date} = body;

  // バリデーション
  if (!item || amount === undefined || !date) {
    // 必須項目チェック
    return c.json({message: "必須項目が不足しています。"}, 400);
  }

  if (typeof amount !== "number" || amount === 0) {
    // 金額チェック
    return c.json({message: "金額は0以外の数値である必要があります。"}, 400);
  }

  // 日付の形式チェック
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({message: "日付はYYYY-MM-DD形式で入力してください。"},400);
  }

  // データベースの登録処理を実行
  const result = await client.query(
    `INSERT INTO transactions (item, amount, date) VALUES ($1,$2,$3) RETURNING id, item, amount, date`,
    [item,amount,date]
  );

  const newTransactions = {
    id: parseInt(result.rows[0].id),
    item: result.rows[0].item,
    amount: parseFloat(result.rows[0].amount),
    date: toYMD(new Date(result.rows[0].date))
  }

  return c.json(newTransactions,201);
});

export default app