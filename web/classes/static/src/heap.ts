type Comparator<T> = (a: T, b: T) => number;

export class Heap<T> {
    private readonly heap: T[];
    private readonly compare: Comparator<T>;
    private count = 0;
    private readonly capacity: number;

    /**
     * @param compareFn Should return > 0 if `a` has higher priority than `b`,
     *                  < 0 if `b` has higher priority, and 0 if equal.
     */
    constructor(compareFn?: Comparator<T>, capacity = 100) {
        this.compare = compareFn ?? ((a, b) => (a > b ? 1 : a < b ? -1 : 0));
        this.capacity = capacity;
        this.heap = new Array<T>(this.capacity);
    }

    public size(): number {
        return this.count;
    }

    public isEmpty(): boolean {
        return this.count === 0;
    }

    public isFull(): boolean {
        return this.count >= this.capacity;
    }

    public peek(): T | undefined {
        return this.count === 0 ? undefined : this.heap[0];
    }

    public insert(value: T): boolean {
        if (this.count >= this.capacity) return false;

        this.heap[this.count] = value;
        this.heapifyUp(this.count);
        this.count++;
        return true;
    }

    public replaceTop(value: T): T | undefined {
        if (this.count === 0) {
            this.insert(value);
            return undefined;
        }

        const top = this.heap[0];
        this.heap[0] = value;
        this.heapifyDown(0);
        return top;
    }

    public pop(): T | undefined {
        if (this.isEmpty()) return undefined;

        const top = this.heap[0];
        this.count--;

        if (this.count > 0) {
            this.heap[0] = this.heap[this.count];
            this.heapifyDown(0);
        }

        // Optional: clear reference so garbage collector can free popped objects
        this.heap[this.count] = undefined as unknown as T;

        return top;
    }

    private heapifyUp(index: number): void {
        let currentIndex = index;
        while (currentIndex > 0) {
            const parentIndex = Math.floor((currentIndex - 1) / 2);
            if (this.compare(this.heap[currentIndex], this.heap[parentIndex]) > 0) {
                this.swap(currentIndex, parentIndex);
                currentIndex = parentIndex;
            } else {
                break;
            }
        }
    }

    private heapifyDown(index: number): void {
        let currentIndex = index;

        while (true) {
            const leftChildIndex = 2 * currentIndex + 1;
            const rightChildIndex = 2 * currentIndex + 2;
            let largestIndex = currentIndex;

            // Use `this.count` instead of `this.heap.length`
            if (leftChildIndex < this.count && this.compare(this.heap[leftChildIndex], this.heap[largestIndex]) > 0) {
                largestIndex = leftChildIndex;
            }

            if (rightChildIndex < this.count && this.compare(this.heap[rightChildIndex], this.heap[largestIndex]) > 0) {
                largestIndex = rightChildIndex;
            }

            if (largestIndex !== currentIndex) {
                this.swap(currentIndex, largestIndex);
                currentIndex = largestIndex;
            } else {
                break;
            }
        }
    }

    private swap(i: number, j: number): void {
        [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    }
}
