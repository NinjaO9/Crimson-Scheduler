/**
 * @fileoverview Provides safe DOM element and text construction helpers.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

/**
 * Creates an element and assigns an optional class name and text content.
 *
 * @param tagName - HTML tag to create.
 * @param className - CSS class name to apply.
 * @param text - Value converted to the element's text content.
 * @returns The newly created element.
 */
export function createElementWithText<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string | null,
  text: unknown,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text === null || text === undefined ? "" : String(text);
  return element;
}

/**
 * Creates a text element with {@link createElementWithText} and appends it to a parent.
 *
 * @param parent - Element that receives the new child.
 * @param tagName - HTML tag to create.
 * @param className - CSS class name to apply.
 * @param text - Value converted to the child's text content.
 * @returns The appended element.
 */
export function appendTextElement<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement | DocumentFragment,
  tagName: K,
  className: string | null,
  text: unknown,
): HTMLElementTagNameMap[K] {
  const element = createElementWithText(tagName, className, text);
  parent.appendChild(element);
  return element;
}

/**
 * Creates a consistently styled line for a calendar course block.
 *
 * @param text - Content displayed in the line.
 * @returns The course-block line element.
 */
export function createCourseBlockLine(text: unknown): HTMLSpanElement {
  return createElementWithText("span", "course-block-line", text);
}
