/**
 * Cursor pages (docs/CONTRACT.md "Pagination"): every list returns `{data, next}`, and `next` goes back as `after`
 * until it is null.
 *
 *   const page = await bx.sessions.list({ limit: 50 });  // one page: page.data, page.next
 *   for await (const s of bx.sessions.list()) { … }       // every session, page after page
 */
export class Page<T> implements AsyncIterable<T> {
  /** The items on this page. */
  readonly data: T[];
  /** The cursor of the following page (pass it as `after`), or null on the last page. */
  readonly next: string | null;
  readonly #load: (after: string) => Promise<Page<T>>;

  constructor(body: { data: T[]; next?: string | null } & Record<string, unknown>, load: (after: string) => Promise<Page<T>>) {
    // Other fields of the list (total, limit, offset, nextAfter) are kept as they are.
    Object.assign(this, body);
    this.data = body.data;
    this.next = typeof body.next === "string" && body.next !== "" ? body.next : null;
    this.#load = load;
  }

  hasNextPage(): boolean {
    return this.next !== null;
  }

  /** The following page (same filters). Throws on the last page: check hasNextPage() first. */
  async getNextPage(): Promise<this> {
    if (this.next === null) throw new Error("this is the last page (next is null)");
    return (await this.#load(this.next)) as this;
  }

  /** This page and every page after it. */
  async *iterPages(): AsyncGenerator<this> {
    let page: this = this;
    yield page;
    while (page.hasNextPage()) {
      page = await page.getNextPage();
      yield page;
    }
  }

  /** Every item from this page on, fetching the following pages as needed. */
  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for await (const page of this.iterPages()) yield* page.data;
  }
}

/**
 * What list methods return: await it for the first page, or iterate it with `for await` for every item.
 * The first page is requested right away.
 */
export class PagePromise<T, P extends Page<T> = Page<T>> extends Promise<P> implements AsyncIterable<T> {
  // then/catch/finally make plain promises, not PagePromises (whose constructor takes a loader).
  static override get [Symbol.species]() {
    return Promise;
  }

  constructor(load: () => Promise<P>) {
    let resolve!: (page: P) => void;
    let reject!: (err: unknown) => void;
    super((res, rej) => {
      resolve = res;
      reject = rej;
    });
    load().then(resolve, reject);
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    yield* await this;
  }
}
