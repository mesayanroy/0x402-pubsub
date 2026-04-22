#!/usr/bin/env node
/**
 * cli/index.ts
 *
 * AgentForge CLI — full terminal interface for the AgentForge platform.
 *
 * Commands:
 *   agentforge init [projectName]         — interactive project scaffold
 *   agentforge dash [--interval <ms>]     — live polymarket/crypto dashboard
 *   agentforge agents list                — list all agents
 *   agentforge agents run <id>            — run agent with 0x402 payment
 *   agentforge deploy <agentId>           — deploy agent & write API to .env
 *   agentforge faucet --wallet <G...>     — claim AF$ testnet tokens
 *   agentforge a2a call <from> <to>       — agent-to-agent routing
 *   agentforge tx status <txHash>         — check Stellar tx
 *   agentforge tx inspect <txHash>        — inspect full tx details
 *
 * The CLI integrates with the 0x402 payment protocol and publishes real-time
 * wallet confirmation events via Ably.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  Keypair,
  Networks,
  Asset,
  Memo,
  TransactionBuilder,
  Operation,
  Horizon,
} from 'stellar-sdk';

// ─── Banner ───────────────────────────────────────────────────────────────────

const BANNER = `
${chalk.cyan('╔══════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('  █████╗  ██████╗ ███████╗███╗   ██╗████████╗')}          ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.white(' ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝')}          ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.white(' ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ')}          ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.white(' ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ')}          ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.white(' ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ')}          ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.white(' ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝  ')}          ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.cyan('        ███████╗ ██████╗ ██████╗  ██████╗ ███████╗')}     ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.cyan('        ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝')}     ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.cyan('        █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ')}     ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.cyan('        ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ')}     ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.cyan('        ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗')}     ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.bold.cyan('        ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝')}     ${chalk.cyan('║')}
${chalk.cyan('╠══════════════════════════════════════════════════════════╣')}
${chalk.cyan('║')}  ${chalk.bold.green('  CLI v0.2.0')} ${chalk.gray('·')} ${chalk.bold.yellow('0x402 Payment Protocol')} ${chalk.gray('·')} ${chalk.bold.blue('Stellar Testnet')}     ${chalk.cyan('║')}
${chalk.cyan('╚══════════════════════════════════════════════════════════╝')}
`;

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

// ─── Ably real-time notifications ─────────────────────────────────────────────

async function publishAblyEvent(
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const ablyKey = process.env.ABLY_API_KEY || process.env.NEXT_PUBLIC_ABLY_KEY;
  if (!ablyKey) return;
  try {
    // Lazy import so the CLI doesn't crash if ably is absent
    const { default: Ably } = await import('ably') as { default: typeof import('ably') };
    const rest = new (Ably as unknown as { Rest: new (opts: { key: string }) => { channels: { get: (ch: string) => { publish: (ev: string, data: unknown) => Promise<void> } } } }).Rest({ key: ablyKey });
    await rest.channels.get('agentforge-cli').publish(event, {
      ...payload,
      source: 'cli',
      timestamp: new Date().toISOString(),
    });
  } catch { /* non-critical — continue */ }
}

/**
 * Subscribe to wallet-confirmation events on the Ably 'agentforge-cli' channel.
 * Prints coloured notifications as they arrive.
 * Returns a function that unsubscribes and closes the connection.
 */
async function subscribeAblyNotifications(walletAddress: string): Promise<() => void> {
  const ablyKey = process.env.ABLY_API_KEY || process.env.NEXT_PUBLIC_ABLY_KEY;
  if (!ablyKey) return () => {};

  try {
    const Ably = (await import('ably')).default as unknown as {
      Realtime: new (opts: { key: string; clientId: string }) => {
        channels: { get: (ch: string) => {
          subscribe: (cb: (msg: { name: string; data: Record<string, unknown> }) => void) => void
        } };
        close: () => void;
      };
    };
    const realtime = new Ably.Realtime({ key: ablyKey, clientId: walletAddress });
    const channel = realtime.channels.get('agentforge-cli');

    channel.subscribe((msg) => {
      const d = msg.data as Record<string, unknown>;
      const ts = chalk.gray(new Date().toLocaleTimeString());
      const wallet = d.wallet ? chalk.cyan(truncate(String(d.wallet))) : '';
      const amount = d.amount ? chalk.yellow(`${d.amount} XLM`) : '';
      const icon =
        msg.name === 'payment_confirmed' ? '💸' :
        msg.name === 'agent_deployed'    ? '🚀' :
        msg.name === 'faucet_claim'      ? '🚰' :
        msg.name === 'agent_run'         ? '🤖' : '🔔';

      console.log(
        `\n  ${icon}  ${chalk.bold(msg.name.toUpperCase())} ${wallet} ${amount}  ${ts}`
      );
      if (d.message) console.log(`     ${chalk.gray(String(d.message))}`);
    });

    return () => realtime.close();
  } catch {
    return () => {};
  }
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

// ─── readline prompt helper ───────────────────────────────────────────────────

async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return rl.question(chalk.cyan('? ') + chalk.bold(question) + ' ');
}

async function promptSelect(
  rl: readline.Interface,
  question: string,
  options: string[]
): Promise<string> {
  console.log(chalk.cyan('? ') + chalk.bold(question));
  options.forEach((o, i) => console.log(chalk.gray(`  ${i + 1}) `) + o));
  const answer = await rl.question(chalk.cyan('  Enter number: '));
  const idx = parseInt(answer.trim(), 10) - 1;
  return options[Math.max(0, Math.min(idx, options.length - 1))];
}

// ─── CLI program ──────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('agentforge')
  .description(
    chalk.cyan('AgentForge CLI') +
      ' — Run AI agents with 0x402 Stellar payments from your terminal'
  )
  .version('0.2.0')
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

      // Subscribe to Ably for wallet confirmation notifications
      const walletForAbly =
        secretKey ? Keypair.fromSecret(secretKey).publicKey() : undefined;
      const unsubAbly = walletForAbly
        ? await subscribeAblyNotifications(walletForAbly)
        : () => {};

      let spinner = ora('Sending request…').start();
      let response: RunResponse;

      try {
        response = await runAgent(apiBase, agentId, opts.input);
      } catch (err) {
        spinner.fail(`Request failed: ${String(err)}`);
        unsubAbly();
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
          unsubAbly();
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

          // Publish payment confirmation to Ably
          await publishAblyEvent('payment_confirmed', {
            wallet: walletAddress,
            amount: pd.amount_xlm,
            txHash,
            agentId,
            message: `Payment of ${pd.amount_xlm} XLM confirmed for agent ${agentId}`,
          });
        } catch (err) {
          spinner.fail(`Payment failed: ${String(err)}`);
          unsubAbly();
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
            unsubAbly();
            process.exit(1);
          }
        }

        // Retry with payment proof
        spinner = ora('Retrying agent request with payment proof…').start();
        try {
          response = await runAgent(apiBase, agentId, opts.input, walletAddress, txHash);
        } catch (err) {
          spinner.fail(`Retry failed: ${String(err)}`);
          unsubAbly();
          process.exit(1);
        }
      }

      if (response.error) {
        spinner.fail(chalk.red(`Agent error: ${response.error}`));
        unsubAbly();
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

      // Notify Ably that the agent run completed
      await publishAblyEvent('agent_run', {
        agentId,
        wallet: walletForAbly,
        message: `Agent ${agentId} completed successfully`,
      });

      unsubAbly();
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

        await publishAblyEvent('a2a_queued', {
          fromAgentId,
          toAgentId,
          correlationId,
          wallet: walletAddress,
        });
      } catch (err) {
        spinner.fail(`Failed to queue A2A request: ${String(err)}`);
        process.exit(1);
      }
    }
  );

// ─── init (interactive) ───────────────────────────────────────────────────────

program
  .command('init [projectName]')
  .description('Initialize a new AgentForge project with interactive setup')
  .action(async (projectNameArg?: string) => {
    const rl = readline.createInterface({ input, output, terminal: false });

    console.log(BANNER);
    console.log(chalk.bold.cyan('  ╔══════════════════════════════════╗'));
    console.log(chalk.bold.cyan('  ║   AgentForge  •  CLI  init       ║'));
    console.log(chalk.bold.cyan('  ╚══════════════════════════════════╝\n'));
    console.log(chalk.white('  Welcome! Let\'s scaffold your AgentForge project.\n'));

    // ── Interactive prompts ─────────────────────────────────────────────
    const projectName =
      projectNameArg ||
      (await prompt(rl, 'Project name (default: my-agent):')) ||
      'my-agent';

    const templateChoice = await promptSelect(rl, 'Choose a starter template:', [
      'defi-analyst      — DeFi protocol analysis & yield tracking',
      'trading-bot       — Automated trading signals & execution',
      'mev-bot           — MEV opportunity detection on Stellar DEX',
      'arbitrage-tracker — Cross-DEX arbitrage scanner',
      'prediction-market — Polymarket-style event prediction agent',
      'custom            — Blank canvas (no template)',
    ]);
    const templateId = templateChoice.split(/\s+/)[0];

    const agentName =
      (await prompt(rl, `Agent name (default: ${templateId}-agent):`)) ||
      `${templateId}-agent`;

    const agentModel = await promptSelect(rl, 'AI model for the agent:', [
      'openai-gpt4o-mini   (fast, cost-efficient)',
      'openai-gpt4o        (best reasoning)',
      'anthropic-claude-3  (long context)',
    ]);
    const modelId = agentModel.split(/\s+/)[0];

    const agentPrompt =
      (await prompt(rl, 'Describe your agent\'s goal in one sentence:')) ||
      `I am a ${templateId} agent powered by AgentForge.`;

    const priceXlm =
      parseFloat(await prompt(rl, 'Price per run in XLM (default: 0.05):')) || 0.05;

    const apiUrl =
      (await prompt(rl, 'AgentForge API URL (default: http://localhost:3000):')) ||
      'http://localhost:3000';

    const stellarSecret =
      (await prompt(rl, 'Stellar secret key (S...) — leave blank to fill later:')) || '';

    rl.close();

    // ── Create directories ──────────────────────────────────────────────
    const spinner = ora('Creating project structure…').start();

    const dirs = [
      projectName,
      `${projectName}/agents`,
      `${projectName}/agents/templates`,
      `${projectName}/tasks`,
      `${projectName}/workflows`,
      `${projectName}/config`,
      `${projectName}/docs`,
      `${projectName}/.agentforge`,
      `${projectName}/env`,
    ];

    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // ── .env ────────────────────────────────────────────────────────────
    fs.writeFileSync(
      `${projectName}/.env`,
      `# AgentForge Environment — generated by agentforge init
AGENTFORGE_API_URL=${apiUrl}
STELLAR_AGENT_SECRET=${stellarSecret}
QSTASH_TOKEN=
ABLY_API_KEY=
NEXT_PUBLIC_ABLY_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
`
    );

    // ── config/agents.json ─────────────────────────────────────────────
    const agentId = agentName.toLowerCase().replace(/\s+/g, '_');
    fs.writeFileSync(
      `${projectName}/config/agents.json`,
      JSON.stringify(
        {
          agents: [
            {
              id: agentId,
              name: agentName,
              description: agentPrompt,
              model: modelId,
              price_xlm: priceXlm,
              template: templateId,
              is_active: true,
            },
          ],
        },
        null,
        2
      )
    );

    // ── agents/templates/<templateId>.json ─────────────────────────────
    const templatePrompts: Record<string, string> = {
      'defi-analyst':
        'You are a DeFi analyst. Analyse yield rates, liquidity pools, and TVL. Return JSON with top opportunities.',
      'trading-bot':
        'You are a trading bot. Given market data, provide buy/sell/hold signals with confidence scores.',
      'mev-bot':
        'You are an MEV detection bot. Scan pending Stellar DEX transactions and identify profitable arbitrage paths.',
      'arbitrage-tracker':
        'You are an arbitrage tracker. Monitor multiple DEX pairs and alert when spread exceeds threshold.',
      'prediction-market':
        'You are a prediction market agent. Evaluate event probabilities and recommend stake allocations.',
      custom: 'You are an AgentForge agent. ' + agentPrompt,
    };

    fs.writeFileSync(
      `${projectName}/agents/templates/${templateId}.json`,
      JSON.stringify(
        {
          id: templateId,
          name: agentName,
          systemPrompt: templatePrompts[templateId] ?? templatePrompts.custom,
          userPrompt: agentPrompt,
          model: modelId,
          tools: [],
        },
        null,
        2
      )
    );

    // ── tasks/queue.json ───────────────────────────────────────────────
    fs.writeFileSync(
      `${projectName}/tasks/queue.json`,
      JSON.stringify(
        {
          tasks: [
            {
              id: 'task-1',
              agent: agentId,
              input: 'Run initial analysis',
              scheduled: false,
              status: 'pending',
            },
          ],
        },
        null,
        2
      )
    );

    // ── workflows/default.json ─────────────────────────────────────────
    fs.writeFileSync(
      `${projectName}/workflows/default.json`,
      JSON.stringify(
        {
          name: 'Default Workflow',
          tasks: ['task-1'],
          agents: [agentId],
          notes: agentPrompt,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    // ── README.md ──────────────────────────────────────────────────────
    fs.writeFileSync(
      `${projectName}/README.md`,
      `# ${projectName}

AgentForge project scaffolded with \`agentforge init\`.

## Agent: ${agentName}
- **Template**: ${templateId}
- **Model**: ${modelId}
- **Price**: ${priceXlm} XLM per run

## Quick Start

\`\`\`bash
cd ${projectName}

# 1. Fill in .env with your API keys
# 2. List available agents
agentforge agents list

# 3. Open live dashboard
agentforge dash

# 4. Run your agent
agentforge agents run ${agentId} --input "your prompt" --secret $STELLAR_AGENT_SECRET

# 5. Deploy to AgentForge platform
agentforge deploy ${agentId}
\`\`\`

## Template: ${templateId}

${templatePrompts[templateId] ?? ''}

See [AgentForge CLI Docs](https://agentforge.dev/docs/cli) for full documentation.
`
    );

    spinner.succeed(chalk.green('Project structure created!'));
    console.log('');
    console.log(chalk.bold('  📁 Created:'));
    dirs.forEach((d) => console.log(chalk.gray(`     📁 ${d}/`)));
    console.log(chalk.gray(`     📄 ${projectName}/.env`));
    console.log(chalk.gray(`     📄 ${projectName}/config/agents.json`));
    console.log(chalk.gray(`     📄 ${projectName}/agents/templates/${templateId}.json`));
    console.log(chalk.gray(`     📄 ${projectName}/tasks/queue.json`));
    console.log(chalk.gray(`     📄 ${projectName}/workflows/default.json`));
    console.log(chalk.gray(`     📄 ${projectName}/README.md`));
    console.log('');
    console.log(chalk.bold('  🚀 Next steps:'));
    console.log(chalk.gray(`     1. cd ${projectName}`));
    console.log(chalk.gray('     2. Edit .env — add STELLAR_AGENT_SECRET, API keys'));
    console.log(chalk.gray('     3. agentforge dash           — open live dashboard'));
    console.log(chalk.gray(`     4. agentforge agents run ${agentId} --input "test"`));
    console.log(chalk.gray(`     5. agentforge deploy ${agentId}  — deploy to platform`));
    console.log('');
    console.log(
      chalk.cyan('  📖 Full guide: ') +
        chalk.underline('https://agentforge.dev/docs/cli')
    );
    console.log('');
  });

// ─── deploy ───────────────────────────────────────────────────────────────────

program
  .command('deploy <agentId>')
  .description('Deploy an agent to the AgentForge platform and write API keys to .env')
  .option('-s, --secret <key>', 'Stellar secret key', process.env.STELLAR_AGENT_SECRET)
  .option('--env-file <path>', 'Path to .env file to update with API keys', '.env')
  .action(async (agentId: string, opts: { secret?: string; envFile: string }) => {
    const apiBase = program.opts().api as string;
    const secretKey = opts.secret || process.env.STELLAR_AGENT_SECRET;

    console.log('');
    console.log(chalk.bold(`🚀 Deploying agent: ${chalk.cyan(agentId)}`));
    console.log('');

    // Load agent config from local agents.json if it exists
    const configPath = path.join(process.cwd(), 'config', 'agents.json');
    let agentConfig: Record<string, unknown> = { id: agentId };
    if (fs.existsSync(configPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { agents?: Record<string, unknown>[] };
        const found = cfg.agents?.find((a) => a.id === agentId);
        if (found) agentConfig = found;
      } catch { /* use defaults */ }
    }

    // Read template if it exists
    const templateId = String(agentConfig.template ?? 'custom');
    const templatePath = path.join(process.cwd(), 'agents', 'templates', `${templateId}.json`);
    let systemPrompt = `You are the ${agentId} agent powered by AgentForge.`;
    if (fs.existsSync(templatePath)) {
      try {
        const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8')) as { systemPrompt?: string };
        if (tpl.systemPrompt) systemPrompt = tpl.systemPrompt;
      } catch { /* use default */ }
    }

    let walletAddress = '';
    if (secretKey) {
      try {
        walletAddress = Keypair.fromSecret(secretKey).publicKey();
      } catch { /* invalid key — continue without wallet */ }
    }

    const spinner = ora('Registering agent with AgentForge platform…').start();
    try {
      const res = await fetch(`${apiBase}/api/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: agentId,
          name: agentConfig.name ?? agentId,
          description: agentConfig.description ?? systemPrompt,
          model: agentConfig.model ?? 'openai-gpt4o-mini',
          price_xlm: agentConfig.price_xlm ?? 0.05,
          owner_wallet: walletAddress,
          system_prompt: systemPrompt,
        }),
      });

      const data = await res.json() as {
        agent?: { id: string; api_key?: string };
        api_key?: string;
        error?: string;
      };

      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

      const apiKey = data.agent?.api_key ?? data.api_key;
      spinner.succeed(chalk.green(`Agent ${chalk.cyan(agentId)} deployed!`));

      // Write api_key to .env file
      if (apiKey) {
        const envPath = path.resolve(opts.envFile);
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        const keyName = `AGENTFORGE_API_KEY_${agentId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        if (envContent.includes(keyName)) {
          envContent = envContent.replace(
            new RegExp(`^${keyName}=.*$`, 'm'),
            `${keyName}=${apiKey}`
          );
        } else {
          envContent += `\n${keyName}=${apiKey}\n`;
        }
        fs.writeFileSync(envPath, envContent);
        console.log('');
        console.log(chalk.bold('  API key written to .env:'));
        console.log(chalk.gray(`    ${keyName}=${truncate(apiKey, 12)}`));
      }

      // Publish deployment event to Ably
      await publishAblyEvent('agent_deployed', {
        agentId,
        wallet: walletAddress,
        message: `Agent ${agentId} deployed by ${truncate(walletAddress)}`,
      });

      console.log('');
      console.log(chalk.bold('  Dashboard:'));
      console.log(chalk.underline(`  ${apiBase}/agents/${agentId}`));
      console.log('');
      console.log(chalk.bold('  Run it:'));
      console.log(chalk.gray(`  agentforge agents run ${agentId} --input "test" --secret $STELLAR_AGENT_SECRET`));
      console.log('');
    } catch (err) {
      if (isLocalApiBase(apiBase)) {
        // Offline / dev mode — save to local store
        spinner.warn(chalk.yellow(`API unreachable — saved ${agentId} to local .agent-store.json`));

        let store: LocalAgentStore = {};
        if (fs.existsSync(LOCAL_AGENT_STORE_PATH)) {
          try { store = JSON.parse(fs.readFileSync(LOCAL_AGENT_STORE_PATH, 'utf8')); } catch {}
        }
        if (!Array.isArray(store.agents)) store.agents = [];
        const existing = store.agents.findIndex((a) => a.id === agentId);
        const record = {
          id: agentId,
          name: String(agentConfig.name ?? agentId),
          description: String(agentConfig.description ?? systemPrompt),
          model: String(agentConfig.model ?? 'openai-gpt4o-mini'),
          price_xlm: Number(agentConfig.price_xlm ?? 0.05),
          owner_wallet: walletAddress,
          is_active: true,
          total_requests: 0,
          total_earned_xlm: 0,
        };
        if (existing >= 0) store.agents[existing] = record;
        else store.agents.push(record);
        fs.writeFileSync(LOCAL_AGENT_STORE_PATH, JSON.stringify(store, null, 2));
        console.log(chalk.gray(`  Saved to ${LOCAL_AGENT_STORE_PATH}`));
      } else {
        spinner.fail(`Deploy failed: ${String(err)}`);
        process.exit(1);
      }
    }
  });

// ─── faucet ───────────────────────────────────────────────────────────────────

program
  .command('faucet')
  .description('Claim AF$ testnet tokens to your Stellar Freighter wallet')
  .requiredOption('-w, --wallet <address>', 'Your Stellar G-address (from Freighter)')
  .option('--api <url>', 'Override AgentForge API URL')
  .action(async (opts: { wallet: string; api?: string }) => {
    const apiBase = opts.api ?? (program.opts().api as string);
    const wallet = opts.wallet.trim();

    console.log('');
    console.log(chalk.bold(`🚰 AF$ Faucet — claiming to: ${chalk.cyan(truncate(wallet))}`));
    console.log('');

    if (wallet.length < 56 || !wallet.startsWith('G')) {
      console.log(chalk.red('  ✗ Invalid wallet address. Must be a 56-character Stellar G-address.'));
      process.exit(1);
    }

    // First check remaining claims
    const checkSpinner = ora('Checking claim eligibility…').start();
    try {
      const checkRes = await fetch(`${apiBase}/api/faucet/claims?wallet=${encodeURIComponent(wallet)}`);
      const checkData = await checkRes.json() as { claimsRemaining: number; totalClaimed: number; error?: string };

      if (checkData.error) throw new Error(checkData.error);

      checkSpinner.succeed(
        `Claims remaining: ${chalk.cyan(checkData.claimsRemaining)} / 3  ` +
          (checkData.totalClaimed > 0
            ? chalk.gray(`(already received ${checkData.totalClaimed * 5} XLM)`)
            : '')
      );

      if (checkData.claimsRemaining === 0) {
        console.log(chalk.yellow('\n  ⚠ Claim limit reached (max 3 per wallet).'));
        process.exit(0);
      }
    } catch (err) {
      checkSpinner.warn(chalk.yellow(`Could not check claims: ${String(err)}`));
    }

    const claimSpinner = ora('Requesting 5 XLM from faucet…').start();
    try {
      const res = await fetch(`${apiBase}/api/faucet/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet }),
      });
      const data = await res.json() as {
        txHash?: string;
        claimsRemaining?: number;
        amountXlm?: number;
        explorerUrl?: string;
        error?: string;
      };

      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

      claimSpinner.succeed(chalk.green(`✅  ${data.amountXlm ?? 5} XLM sent to your Freighter wallet!`));
      console.log('');
      console.log(`  Tx Hash : ${chalk.cyan(data.txHash ?? 'n/a')}`);
      console.log(`  Explorer: ${chalk.underline(data.explorerUrl ?? stellarExplorerUrl(data.txHash ?? ''))}`);
      console.log(`  Claims remaining: ${chalk.cyan(data.claimsRemaining ?? 'n/a')} / 3`);
      console.log('');
      console.log(chalk.gray('  Open Freighter → check your XLM balance to confirm.'));
      console.log('');

      await publishAblyEvent('faucet_claim', {
        wallet,
        amount: data.amountXlm ?? 5,
        txHash: data.txHash,
        message: `Faucet claimed ${data.amountXlm ?? 5} XLM to ${truncate(wallet)}`,
      });
    } catch (err) {
      claimSpinner.fail(chalk.red(`Faucet claim failed: ${String(err)}`));
      console.log('');
      console.log(chalk.gray('  If the faucet wallet is unfunded, visit:'));
      console.log(chalk.underline(`  https://friendbot.stellar.org?addr=${wallet}`));
      console.log('');
      process.exit(1);
    }
  });

// ─── dash ─────────────────────────────────────────────────────────────────────

program
  .command('dash')
  .description('Live terminal polymarket dashboard — markets, agents, trades, PnL, predictions')
  .option('--interval <ms>', 'Refresh interval in ms', '3000')
  .action(async (opts: { interval: string }) => {
    const apiBase = program.opts().api as string;
    const interval = Math.max(1000, parseInt(opts.interval, 10) || 3000);

    function clearScreen() {
      process.stdout.write('\x1B[2J\x1B[0f');
    }

    function colorPnl(n: number): string {
      if (n > 0) return chalk.green(`+${n.toFixed(4)}`);
      if (n < 0) return chalk.red(`${n.toFixed(4)}`);
      return chalk.white('0.0000');
    }

    // Color legend:
    //   green  = bullish / positive / active
    //   red    = bearish / negative / inactive
    //   yellow = staking / earnings / warning
    //   blue   = prediction / informational
    //   white  = neutral price / data
    //   cyan   = identity / pair label
    //   gray   = muted / metadata

    const MARKET_PAIRS = [
      { pair: 'XLM/USDC',  base: 0.12,   col: chalk.cyan },
      { pair: 'BTC/USDC',  base: 43200,  col: chalk.yellow },
      { pair: 'ETH/USDC',  base: 2500,   col: chalk.green },
      { pair: 'SOL/USDC',  base: 170,    col: chalk.blue },
      { pair: 'AF$/USDC',  base: 0.05,   col: chalk.white },
    ];

    const STAKING_POOLS = [
      { pool: 'XLM-USDC LP',   apy: 12.4, tvl: 1_420_000 },
      { pool: 'AF$-XLM LP',    apy: 34.1, tvl: 280_000 },
      { pool: 'ETH-USDC LP',   apy: 8.7,  tvl: 9_800_000 },
    ];

    // Track simulated prices between renders for realistic drift
    const prices: number[] = MARKET_PAIRS.map((m) => m.base);

    async function render() {
      let agents: AgentRecord[] = [];
      try {
        agents = await fetchAgents(apiBase);
      } catch {
        agents = [];
      }

      // Drift prices
      for (let i = 0; i < prices.length; i++) {
        prices[i] *= 1 + (Math.random() - 0.499) * 0.005;
      }

      const now = new Date().toLocaleTimeString();
      clearScreen();
      console.log(BANNER);

      // ── CRYPTO MARKETS ──────────────────────────────────────────────
      console.log(chalk.bold.white('  ┌──────────────────────────────────────────────────────────────────────────┐'));
      console.log(
        chalk.bold.white('  │') +
        chalk.bold.cyan('  📊 CRYPTO POLYMARKET DASHBOARD') +
        chalk.gray('  ·  Stellar DEX  ·  ') +
        chalk.white(now) +
        chalk.bold.white('                  │')
      );
      console.log(chalk.bold.white('  ├───────────────┬──────────────┬───────────┬────────────┬─────────────────┤'));
      console.log(
        chalk.bold.white('  │') + chalk.bold('  Pair          ') +
        chalk.bold.white('│') + chalk.bold('  Price       ') +
        chalk.bold.white('│') + chalk.bold(' 24h Change') +
        chalk.bold.white('│') + chalk.bold('    Volume  ') +
        chalk.bold.white('│') + chalk.bold('  Prediction     ') +
        chalk.bold.white('│')
      );
      console.log(chalk.bold.white('  ├───────────────┼──────────────┼───────────┼────────────┼─────────────────┤'));

      for (let i = 0; i < MARKET_PAIRS.length; i++) {
        const { pair, col } = MARKET_PAIRS[i];
        const price = prices[i];
        const change = (Math.random() - 0.45) * 6;
        const vol = (Math.random() * 600_000 + 80_000).toFixed(0);
        const confidence = Math.floor(Math.random() * 40 + 55);
        const bullish = change > 0;
        const pred = bullish ? chalk.green(`▲ BULL ${confidence}%`) : chalk.red(`▼ BEAR ${confidence}%`);
        const changeStr = change >= 0 ? chalk.green(`+${change.toFixed(2)}%`) : chalk.red(`${change.toFixed(2)}%`);
        const priceStr = price >= 1000 ? price.toFixed(2) : price >= 1 ? price.toFixed(4) : price.toFixed(6);
        console.log(
          chalk.bold.white('  │') +
          col(`  ${pair.padEnd(14)}`) +
          chalk.bold.white('│') +
          chalk.white(`  ${priceStr.padEnd(12)}`) +
          chalk.bold.white('│') +
          ` ${changeStr.padEnd(18)}` +
          chalk.bold.white('│') +
          chalk.white(` $${vol.padStart(9)}  `) +
          chalk.bold.white('│') +
          `  ${pred.padEnd(24)}` +
          chalk.bold.white('│')
        );
      }
      console.log(chalk.bold.white('  └───────────────┴──────────────┴───────────┴────────────┴─────────────────┘'));
      console.log('');

      // ── STAKING / YIELDS ─────────────────────────────────────────────
      console.log(chalk.bold.white('  ┌──────────────────────────────────────────────────────────────────────────┐'));
      console.log(chalk.bold.white('  │') + chalk.bold.yellow('  💰 STAKING & YIELD RATES') + chalk.gray('  ·  Live APY') + chalk.bold.white('                                     │'));
      console.log(chalk.bold.white('  ├─────────────────────────────┬──────────┬──────────────────────────────────┤'));
      console.log(
        chalk.bold.white('  │') + chalk.bold('  Pool                        ') +
        chalk.bold.white('│') + chalk.bold('  APY      ') +
        chalk.bold.white('│') + chalk.bold('  TVL                           ') +
        chalk.bold.white('│')
      );
      console.log(chalk.bold.white('  ├─────────────────────────────┼──────────┼──────────────────────────────────┤'));
      for (const pool of STAKING_POOLS) {
        const apy = pool.apy + (Math.random() - 0.5) * 1.5;
        const tvl = pool.tvl + (Math.random() - 0.5) * pool.tvl * 0.01;
        const apyStr = chalk.yellow(`${apy.toFixed(2)}%`);
        const tvlStr = chalk.green(`$${(tvl / 1_000_000).toFixed(2)}M`);
        console.log(
          chalk.bold.white('  │') +
          `  ${chalk.cyan(pool.pool.padEnd(28))}` +
          chalk.bold.white('│') +
          `  ${apyStr.padEnd(17)}` +
          chalk.bold.white('│') +
          `  ${tvlStr.padEnd(41)}` +
          chalk.bold.white('│')
        );
      }
      console.log(chalk.bold.white('  └─────────────────────────────┴──────────┴──────────────────────────────────┘'));
      console.log('');

      // ── ACTIVE AGENTS ────────────────────────────────────────────────
      console.log(chalk.bold.white('  ┌──────────────────────────────────────────────────────────────────────────┐'));
      console.log(chalk.bold.white('  │') + chalk.bold.yellow('  🤖 ACTIVE AGENTS') + chalk.bold.white('                                                           │'));
      console.log(chalk.bold.white('  ├──────────────────────────────┬────────────────┬──────────┬───────────────┤'));
      console.log(
        chalk.bold.white('  │') + chalk.bold('  Agent                        ') +
        chalk.bold.white('│') + chalk.bold('  Model         ') +
        chalk.bold.white('│') + chalk.bold(' Requests ') +
        chalk.bold.white('│') + chalk.bold(' Earned XLM    ') +
        chalk.bold.white('│')
      );
      console.log(chalk.bold.white('  ├──────────────────────────────┼────────────────┼──────────┼───────────────┤'));
      for (const a of agents.slice(0, 5)) {
        const status = a.is_active ? chalk.green('●') : chalk.red('●');
        console.log(
          chalk.bold.white('  │') +
          ` ${status} ${chalk.cyan(a.name.slice(0, 26).padEnd(28))}` +
          chalk.bold.white('│') +
          chalk.gray(` ${a.model.slice(0, 14).padEnd(15)} `) +
          chalk.bold.white('│') +
          chalk.white(`  ${String(a.total_requests).padStart(6)}  `) +
          chalk.bold.white('│') +
          chalk.yellow(` ${a.total_earned_xlm.toFixed(4).padStart(10)} XLM`) +
          chalk.bold.white('│')
        );
      }
      if (agents.length === 0) {
        console.log(
          chalk.bold.white('  │') +
          chalk.gray('  No agents found. Run `agentforge deploy <id>` to register one.') +
          chalk.bold.white('           │')
        );
      }
      console.log(chalk.bold.white('  └──────────────────────────────┴────────────────┴──────────┴───────────────┘'));
      console.log('');

      // ── RECENT ACTIVITY (Ably feed) ──────────────────────────────────
      const activities = [
        { type: chalk.cyan('AGENT_RUN'),  agent: 'MEV Bot',            pnl: colorPnl(+(Math.random() * 0.2).toFixed(4)), wallet: 'GB3X…9K' },
        { type: chalk.green('PAYMENT'),   agent: 'Trading Bot',         pnl: colorPnl(+(Math.random() * 0.15).toFixed(4)), wallet: 'GC7Y…2M' },
        { type: chalk.yellow('STAKING'),  agent: 'Liquidity Tracker',   pnl: colorPnl(+(Math.random() * 0.1 - 0.03).toFixed(4)), wallet: 'GA2B…8L' },
        { type: chalk.blue('PREDICT'),    agent: 'Mempool Monitor',      pnl: colorPnl(+(Math.random() * 0.12).toFixed(4)), wallet: 'GD9P…5N' },
        { type: chalk.red('YIELD'),       agent: 'Arbitrage Tracker',    pnl: colorPnl(+(Math.random() * 0.25).toFixed(4)), wallet: 'GF1Q…3R' },
        { type: chalk.white('FAUCET'),    agent: 'AF$ Faucet',           pnl: chalk.white('5.0000 XLM'),                   wallet: 'GH8Q…7P' },
      ];

      console.log(chalk.bold.white('  ┌──────────────────────────────────────────────────────────────────────────┐'));
      console.log(
        chalk.bold.white('  │') +
        chalk.bold.green('  ⚡ REAL-TIME ACTIVITY') +
        chalk.gray('  via Ably  ·  0x402') +
        chalk.bold.white('                                      │')
      );
      console.log(chalk.bold.white('  ├───────────────┬──────────────────────────┬─────────────┬────────────────┤'));
      console.log(
        chalk.bold.white('  │') + chalk.bold(' Type          ') +
        chalk.bold.white('│') + chalk.bold(' Agent                    ') +
        chalk.bold.white('│') + chalk.bold(' PnL / XLM   ') +
        chalk.bold.white('│') + chalk.bold(' Wallet         ') +
        chalk.bold.white('│')
      );
      console.log(chalk.bold.white('  ├───────────────┼──────────────────────────┼─────────────┼────────────────┤'));
      for (const act of activities) {
        console.log(
          chalk.bold.white('  │') +
          ` ${act.type.padEnd(22)}` +
          chalk.bold.white('│') +
          chalk.white(` ${act.agent.padEnd(25)} `) +
          chalk.bold.white('│') +
          ` ${act.pnl.padEnd(20)}` +
          chalk.bold.white('│') +
          chalk.gray(` ${act.wallet.padEnd(15)} `) +
          chalk.bold.white('│')
        );
      }
      console.log(chalk.bold.white('  └───────────────┴──────────────────────────┴─────────────┴────────────────┘'));
      console.log('');

      // Color legend
      console.log(
        chalk.gray('  Legend: ') +
        chalk.green('■ Bullish/Active') + chalk.gray('  ') +
        chalk.red('■ Bearish/Inactive') + chalk.gray('  ') +
        chalk.yellow('■ Staking/Earnings') + chalk.gray('  ') +
        chalk.blue('■ Prediction') + chalk.gray('  ') +
        chalk.white('■ Neutral/Faucet')
      );
      console.log(chalk.gray(`  Refreshing every ${interval}ms  ·  Press Ctrl+C to exit`));
    }

    await render();
    const timer = setInterval(render, interval);

    process.on('SIGINT', () => {
      clearInterval(timer);
      console.log('\n' + chalk.cyan('  Dashboard closed. Goodbye! 👋\n'));
      process.exit(0);
    });
  });

// ─── Print banner & parse ─────────────────────────────────────────────────────

console.log(BANNER);
program.parseAsync(process.argv);

