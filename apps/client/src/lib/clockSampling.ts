import { ClockSync, type ClockSample } from "@watchparty/shared";
export interface ClockTransport {
  ping: () => Promise<number>;
}
// Scheduling is separate from sample selection, and owns every cancellable timer.
export class ClockSampler {
  private generation = 0;
  private wake: (() => void) | undefined;
  private spacing: ReturnType<typeof setTimeout> | undefined;
  private periodic: ReturnType<typeof setInterval> | undefined;
  private running: Promise<boolean> | undefined;
  constructor(
    readonly clock: ClockSync,
    private readonly transport: ClockTransport,
    private readonly changed: () => void,
    private readonly wallNow = Date.now,
    private readonly monotonicNow = () => performance.now(),
  ) {}
  sample(count = 3): Promise<boolean> {
    if (this.running) return this.running;
    const generation = this.generation;
    const job = (async () => {
      const samples: ClockSample[] = [];
      for (let i = 0; i < count && generation === this.generation; i++) {
        const t0 = this.wallNow();
        const start = this.monotonicNow();
        try {
          const serverNow = await this.transport.ping();
          samples.push({ t0, rtt: this.monotonicNow() - start, serverNow });
        } catch {
          /* Keep a valid low-latency sample if a later ping times out. */
        }
        if (i < count - 1 && generation === this.generation)
          await new Promise<void>((resolve) => {
            this.wake = resolve;
            this.spacing = setTimeout(() => {
              this.spacing = undefined;
              this.wake = undefined;
              resolve();
            }, 200);
          });
      }
      if (generation !== this.generation) return false;
      const accepted = this.clock.ingest(samples);
      this.changed();
      return accepted;
    })();
    this.running = job;
    void job.finally(() => {
      if (this.running === job) this.running = undefined;
    });
    return job;
  }
  start() {
    this.stop();
    const sample = this.sample(5);
    this.periodic = setInterval(() => {
      void this.sample(3);
    }, 30000);
    return sample;
  }
  stop() {
    this.generation++;
    if (this.periodic) clearInterval(this.periodic);
    if (this.spacing) clearTimeout(this.spacing);
    this.wake?.();
    this.wake = undefined;
    this.spacing = undefined;
    this.periodic = undefined;
    this.running = undefined;
  }
}
