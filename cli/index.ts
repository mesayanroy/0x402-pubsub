#!/usr/bin/env node
/**
 * cli/index.ts
 *
 * AgentForge CLI — run agents and manage the 0x402 payment protocol from
 * the terminal.
 *
 * Usage:
 *   agentforge agents list
 *   agentforge agents run <agentId> --input "your prompt"
 *   agentforge agents run <agentId> --input "..." --secret <STELLAR_SECRET>
 *   agentforge tx status <txHash>
 *   agentforge tx inspect <txHash>
 *
 * The CLI integrates with the 0x402 payment protocol: when an agent requires
 * payment, the CLI builds a Stellar payment transaction using the provided
 * secret key, signs it, submits it to Horizon and retries the agent call with
 * the transaction hash in the X-Payment-Tx-Hash header.
 *
 * In a browser context you would use Freighter instead of a raw secret key.
 * For automated / server-side usage this CLI uses stellar-sdk directly.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'node:fs';
import path from 'node:path';
import {
  Keypair,
  Networks,
  Asset,
  Memo,
  TransactionBuilder,
  Operation,
  Horizon,
} from 'stellar-sdk';

// ─── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_API_BASE = process.env.AGENTFORGE_API_URL || 'http://localhost:3000';
const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const LOCAL_AGENT_STORE_PATH = path.join(process.cwd(), '.agent-store.json');
const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet') as
  | 'testnet'
  | 'mainnet';
const NETWORK_PASSPHRASE =
  STELLAR_NETWORK === 'mainnet'
    ? Networks.PUBLIC
    : Networks.TESTNET;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stellarExplorerUrl(txHash: string): string {
  return `https://stellar.expert/explorer/${STELLAR_NETWORK}/tx/${txHash}`;
}

function truncate(s: string, n = 8): string {
  if (s.length <= n * 2 + 3) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

interface AgentRecord {
  id: string;
  name: string;
  description: string;
  model: string;
  price_xlm: number;
  total_requests: number;
  total_earned_xlm: number;
  is_active: boolean;
  owner_wallet: string;
}

interface RunResponse {
  output?: string;
  request_id?: string;
  latency_ms?: number;
  error?: string;
  payment_details?: {
    amount_xlm: number;
    address: string;
    network: string;
    memo: string;
  };
}

interface LocalAgentStore {
  agents?: Array<Partial<AgentRecord> & { id: string; name?: string }>;
}

/**
 * Build, sign and submit a Stellar XLM payment.
 * Returns the transaction hash.
 */
async function payXLM(
  secretKey: string,
  destination: string,
  amountXlm: number,
  memo: string
): Promise<string> {
  const keypair = Keypair.fromSecret(secretKey);
  const server = new Horizon.Server(HORIZON_URL);

  const account = await server.loadAccount(keypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount: amountXlm.toFixed(7),
      })
    )
    .addMemo(Memo.text(memo.slice(0, 28)))
    .setTimeout(30)
    .build();

  tx.sign(keypair);
  const result = await server.submitTransaction(tx);
  return result.hash;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function isLocalApiBase(apiBase: string): boolean {
  try {
    const url = new URL(apiBase);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function fallbackDemoAgent(): AgentRecord {
  return {
    id: '1',
    owner_wallet: 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234XYZ1',
    name: 'DeFi Analyst',
    description: 'Analyzes DeFi protocols, yields, and on-chain metrics in real time.',
    model: 'openai-gpt4o-mini',
    price_xlm: 0.05,
    total_requests: 0,
    total_earned_xlm: 0,
    is_active: true,
  };
}

function readLocalAgentsFallback(): AgentRecord[] {
  try {
    if (!fs.existsSync(LOCAL_AGENT_STORE_PATH)) {
      return [fallbackDemoAgent()];
    }

    const raw = fs.readFileSync(LOCAL_AGENT_STORE_PATH, 'utf8').trim();
    if (!raw) return [fallbackDemoAgent()];

    const parsed = JSON.parse(raw) as LocalAgentStore;
    const rows = Array.isArray(parsed.agents) ? parsed.agents : [];

    const agents = rows
      .filter((a) => a && typeof a.id === 'string' && a.id.length > 0)
      .map((a) => ({
        id: a.id,
        owner_wallet:
          typeof a.owner_wallet === 'string' && a.owner_wallet.length > 0
            ? a.owner_wallet
            : 'unknown',
        name:
          typeof a.name === 'string' && a.name.length > 0
            ? a.name
            : `Agent ${a.id}`,
        description: typeof a.description === 'string' ? a.description : '',
        model: typeof a.model === 'string' ? a.model : 'unknown',
        price_xlm: typeof a.price_xlm === 'number' ? a.price_xlm : 0,
        total_requests:
          typeof a.total_requests === 'number' ? a.total_requests : 0,
        total_earned_xlm:
          typeof a.total_earned_xlm === 'number' ? a.total_earned_xlm : 0,
        is_active: typeof a.is_active === 'boolean' ? a.is_active : true,
      }))
      .filter((a) => a.is_active);

    return agents.length > 0 ? agents : [fallbackDemoAgent()];
  } catch {
    return [fallbackDemoAgent()];
  }
}

async function fetchAgents(apiBase: string): Promise<AgentRecord[]> {
  try {
    const res = await fetch(`${apiBase}/api/agents/list`, { method: 'GET' });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = (await res.json()) as { agents?: AgentRecord[] };
    return data.agents ?? [];
  } catch (err) {
    if (isLocalApiBase(apiBase)) {
      return readLocalAgentsFallback();
    }
    throw err;
  }
}

async function submitSignedXdr(signedXdr: string): Promise<string> {
  const server = new Horizon.Server(HORIZON_URL);
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const result = await server.submitTransaction(tx);
  return result.hash;
}

async function runAgent(
  apiBase: string,
  agentId: string,
  input: string,
  walletAddress?: string,
  txHash?: string
): Promise<RunResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (walletAddress) headers['X-Payment-Wallet'] = walletAddress;
  if (txHash) headers['X-Payment-Tx-Hash'] = txHash;

  const res = await fetch(`${apiBase}/api/agents/${agentId}/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input }),
  });

  return (await res.json()) as RunResponse;
}

// ─── CLI program ──────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('agentforge')
  .description(
    chalk.cyan('AgentForge CLI') +
      ' — Run AI agents with 0x402 Stellar payments from your terminal'
  )
  .version('0.1.0')
  .option('--api <url>', 'AgentForge API base URL', DEFAULT_API_BASE);

// ── agents list ──────────────────────────────────────────────────────────────

const agentsCmd = program.command('agents').description('Manage and run agents');

agentsCmd
  .command('list')
  .description('List all available agents')
  .action(async () => {
    const apiBase = program.opts().api as string;
    const spinner = ora('Fetching agents…').start();
    try {
      const agents = await fetchAgents(apiBase);
      spinner.succeed(`Found ${agents.length} agent(s)`);
      console.log('');

      if (agents.length === 0) {
        console.log(chalk.gray('  No agents found.'));
        return;
      }

      for (const a of agents) {
        const priceTag =
          a.price_xlm > 0
            ? chalk.yellow(`${a.price_xlm} XLM`)
            : chalk.green('FREE');
        const status = a.is_active ? chalk.green('●') : chalk.red('●');
        console.log(
          `  ${status} ${chalk.bold(a.name)} ${chalk.gray(`(${a.id})`)}  ${priceTag}`
        );
        console.log(`     ${chalk.gray(a.description ?? 'No description')}`);
        console.log(
          `     Model: ${chalk.cyan(a.model)}  Requests: ${a.total_requests}  Earned: ${a.total_earned_xlm} XLM`
        );
        console.log('');
      }
    } catch (err) {
      spinner.fail(`Failed to fetch agents: ${String(err)}`);
      process.exit(1);
    }
  });

// ── agents run ───────────────────────────────────────────────────────────────

agentsCmd
  .command('run <agentId>')
  .description('Run an agent with the 0x402 payment protocol')
  .requiredOption('-i, --input <text>', 'Input prompt for the agent')
  .option(
    '-s, --secret <key>',
    'Stellar secret key for payment signing (or set STELLAR_AGENT_SECRET env var)'
  )
  .option(
    '--signed-xdr <xdr>',
    'Signed payment XDR (e.g. signed via Freighter) for submitting the 402 payment'
  )
  .action(
    async (
      agentId: string,
      opts: { input: string; secret?: string; signedXdr?: string }
    ) => {
      const apiBase = program.opts().api as string;
      const secretKey = opts.secret || process.env.STELLAR_AGENT_SECRET;

      console.log('');
      console.log(chalk.bold(`🤖 Running agent: ${chalk.cyan(agentId)}`));
      console.log(`   Input: ${chalk.gray(opts.input)}`);
      console.log('');

      // First request — may return 402
      let spinner = ora('Sending request…').start();
      let response: RunResponse;

      try {
        response = await runAgent(apiBase, agentId, opts.input);
      } catch (err) {
        spinner.fail(`Request failed: ${String(err)}`);
        process.exit(1);
      }

      // ── Handle 402 Payment Required ────────────────────────────────────
      if (response.payment_details) {
        const pd = response.payment_details;
        spinner.warn(
          chalk.yellow(`Payment required: ${pd.amount_xlm} XLM → ${truncate(pd.address)}`)
        );

        if (!secretKey && !opts.signedXdr) {
          console.log('');
          console.log(
            chalk.red('  ✗ No Stellar secret key provided.') +
              '\n    Pass --secret <KEY>, set STELLAR_AGENT_SECRET, or pass --signed-xdr from Freighter.'
          );
          console.log('');
          console.log(chalk.gray('  Payment details:'));
          console.log(`    Amount : ${pd.amount_xlm} XLM`);
          console.log(`    To     : ${pd.address}`);
          console.log(`    Memo   : ${pd.memo}`);
          process.exit(1);
        }

        let walletAddress = '';
        if (secretKey) {
          const keypair = Keypair.fromSecret(secretKey);
          walletAddress = keypair.publicKey();
        }

        spinner = ora(
          opts.signedXdr
            ? 'Submitting Freighter-signed payment XDR…'
            : `Building & signing Stellar payment from ${truncate(walletAddress)}…`
        ).start();

        let txHash: string;
        try {
          if (opts.signedXdr) {
            txHash = await submitSignedXdr(opts.signedXdr);
          } else {
            txHash = await payXLM(secretKey as string, pd.address, pd.amount_xlm, pd.memo);
          }
          spinner.succeed(
            chalk.green(`Payment submitted!  tx: ${truncate(txHash, 12)}`)
          );
          console.log(`   Explorer: ${chalk.underline(stellarExplorerUrl(txHash))}`);
        } catch (err) {
          spinner.fail(`Payment failed: ${String(err)}`);
          process.exit(1);
        }

        if (!walletAddress) {
          spinner = ora('Fetching tx source account for X-Payment-Wallet header…').start();
          try {
            const server = new Horizon.Server(HORIZON_URL);
            const tx = await server.transactions().transaction(txHash).call();
            walletAddress = tx.source_account;
            spinner.succeed(`Source wallet resolved: ${truncate(walletAddress)}`);
          } catch (err) {
            spinner.fail(`Cannot infer wallet from tx ${truncate(txHash)}: ${String(err)}`);
            process.exit(1);
          }
        }

        // Retry with payment proof
        spinner = ora('Retrying agent request with payment proof…').start();
        try {
          response = await runAgent(apiBase, agentId, opts.input, walletAddress, txHash);
        } catch (err) {
          spinner.fail(`Retry failed: ${String(err)}`);
          process.exit(1);
        }
      }

      if (response.error) {
        spinner.fail(chalk.red(`Agent error: ${response.error}`));
        process.exit(1);
      }

      spinner.succeed(
        `Done  ${chalk.gray(`(${response.latency_ms ?? '?'}ms | request_id: ${response.request_id ?? 'n/a'})`)}`
      );
      console.log('');
      console.log(chalk.bold('Output:'));
      console.log('');
      console.log(response.output ?? '(empty)');
      console.log('');
    }
  );

// ── tx status ────────────────────────────────────────────────────────────────

const txCmd = program.command('tx').description('Inspect Stellar transactions');

txCmd
  .command('status <txHash>')
  .description('Check the status of a Stellar transaction')
  .action(async (txHash: string) => {
    const spinner = ora(`Checking tx ${truncate(txHash, 12)}…`).start();
    try {
      const server = new Horizon.Server(HORIZON_URL);
      const tx = await server.transactions().transaction(txHash).call();
      spinner.succeed(tx.successful ? chalk.green('Transaction confirmed') : chalk.red('Transaction failed'));
      console.log('');
      console.log(`  Hash    : ${chalk.cyan(tx.hash)}`);
      console.log(`  Ledger  : ${tx.ledger_attr}`);
      console.log(`  Fee     : ${tx.fee_charged} stroops`);
      console.log(`  Memo    : ${tx.memo ?? '(none)'}`);
      console.log(`  Explorer: ${chalk.underline(stellarExplorerUrl(txHash))}`);
      console.log('');
    } catch (err) {
      spinner.fail(`Cannot retrieve tx: ${String(err)}`);
    }
  });

txCmd
  .command('inspect <txHash>')
  .description('Show full transaction details from Stellar explorer')
  .action(async (txHash: string) => {
    const url = stellarExplorerUrl(txHash);
    console.log('');
    console.log(chalk.bold(`Transaction: ${txHash}`));
    console.log(`Explorer URL: ${chalk.underline(url)}`);
    console.log('');
    const spinner = ora('Fetching transaction details from Horizon…').start();
    try {
      const server = new Horizon.Server(HORIZON_URL);
      const tx = await server.transactions().transaction(txHash).call();
      spinner.succeed('Details loaded');
      console.log('');
      console.log(JSON.stringify(tx, null, 2));
    } catch (err) {
      spinner.fail(`Error: ${String(err)}`);
    }
  });

// ─── A2A agent-to-agent routing ───────────────────────────────────────────────

const a2aCmd = program
  .command('a2a')
  .description('Agent-to-Agent request routing via 0x402');

a2aCmd
  .command('call <fromAgentId> <toAgentId>')
  .description('Route a request from one agent to another (A2A payment flow)')
  .requiredOption('-i, --input <text>', 'Input for the target agent')
  .option('-s, --secret <key>', 'Stellar secret key', process.env.STELLAR_AGENT_SECRET)
  .option('-c, --correlation <id>', 'Custom correlation ID')
  .action(
    async (
      fromAgentId: string,
      toAgentId: string,
      opts: { input: string; secret?: string; correlation?: string }
    ) => {
      const apiBase = program.opts().api as string;
      const correlationId = opts.correlation ?? `a2a-${Date.now()}`;

      console.log('');
      console.log(
        chalk.bold(`🔀 A2A: ${chalk.cyan(fromAgentId)} → ${chalk.cyan(toAgentId)}`)
      );
      console.log(`   Input: ${chalk.gray(opts.input)}`);
      console.log(`   Correlation: ${chalk.gray(correlationId)}`);
      console.log('');

      const secretKey = opts.secret || process.env.STELLAR_AGENT_SECRET;
      if (!secretKey) {
        console.log(chalk.red('  ✗ No Stellar secret key provided.'));
        process.exit(1);
      }
      const walletAddress = Keypair.fromSecret(secretKey).publicKey();

      // Publish A2A request via QStash
      const qstashToken = process.env.QSTASH_TOKEN;
      const qstashUrl = process.env.QSTASH_URL || 'https://qstash.upstash.io';
      if (!qstashToken) {
        console.log(chalk.yellow('  ⚠ QSTASH_TOKEN not set – calling target agent directly.'));
        const response = await runAgent(apiBase, toAgentId, opts.input, walletAddress);
        if (response.output) {
          console.log(chalk.bold('Output:'));
          console.log(response.output);
        }
        return;
      }

      const spinner = ora('Publishing A2A request to QStash…').start();
      const payload = {
        correlationId,
        fromAgentId,
        toAgentId,
        input: opts.input,
        callerWallet: walletAddress,
        createdAt: new Date().toISOString(),
      };

      try {
        const res = await fetch(`${qstashUrl}/v2/publish/${apiBase}/api/consumers/agentforge-a2a-request`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${qstashToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`QStash error: ${res.status}`);
        spinner.succeed('A2A request queued via QStash');
        console.log(chalk.gray(`  Correlation ID: ${correlationId}`));
        console.log(chalk.gray('  Response will be delivered asynchronously.'));
      } catch (err) {
        spinner.fail(`Failed to queue A2A request: ${String(err)}`);
        process.exit(1);
      }
    }
  );

program.parseAsync(process.argv);
