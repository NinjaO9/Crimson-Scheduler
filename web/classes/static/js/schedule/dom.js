export function createElementWithText(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text === null || text === undefined ? "" : String(text);
  return element;
}

export function appendTextElement(parent, tagName, className, text) {
  const element = createElementWithText(tagName, className, text);
  parent.appendChild(element);
  return element;
}

export function createCourseBlockLine(text) {
  return createElementWithText("span", "course-block-line", text);
}
