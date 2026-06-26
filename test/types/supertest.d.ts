export type TestArray = Array<unknown>;

export interface TestObject {
  [key: string]: TestBody;
  [index: number]: TestBody;
  length: number;
  map<T = TestBody>(
    callback: (value: T, index: number, array: T[]) => unknown,
  ): T[];
  filter<T = TestBody>(
    callback: (value: T, index: number, array: T[]) => unknown,
  ): TestBody[];
  find<T = TestBody>(
    callback: (value: T, index: number, array: T[]) => unknown,
  ): TestBody;
  every<T = TestBody>(
    callback: (value: T, index: number, array: T[]) => unknown,
  ): boolean;
  some<T = TestBody>(
    callback: (value: T, index: number, array: T[]) => unknown,
  ): boolean;
}

export interface Response {
  body: TestBody;
  headers: Record<string, string | string[] | undefined>;
  status: number;
  statusCode: number;
  text: string;
}

export interface TestRequest extends PromiseLike<Response> {
  set(field: string, value: string): this;
  send(body?: unknown): this;
  expect(status: number): this;
  expect(callback: (response: Response) => void): this;
  expect(status: number, body: unknown): this;
}

export interface TestAgent {
  get(url: string): TestRequest;
  post(url: string): TestRequest;
  patch(url: string): TestRequest;
  put(url: string): TestRequest;
  delete(url: string): TestRequest;
}

export interface RequestFactory {
  (app: unknown): TestAgent;
  agent(app: unknown): TestAgent;
}

declare const request: RequestFactory;
export default request;

export type TestBody = TestObject & (string | number | boolean | TestArray);
