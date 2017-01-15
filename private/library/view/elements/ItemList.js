/*
 Copyright 2017 Aleksandar Jankovic

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

/**
 * Create and return header paragraph
 * @param {{textLine: string, extraClass: string, clickFunc: Function}[]} headerItems - Items to be appended to the header
 * @param {boolean} printable - Should the item that the header is part of be printable
 * @returns {Element} Header paragraph
 */
function createHeader({ headerItems, printable, parentElement }) {
  const paragraph = document.createElement('P');
  paragraph.classList.add('header');

  console.log(headerItems);

  for (const { textLine, extraClass, clickFunc } of headerItems) {
    const span = document.createElement('SPAN');
    span.appendChild(document.createTextNode(textLine));

    if (clickFunc) {
      span.addEventListener('click', clickFunc);
    }

    if (extraClass) {
      span.classList.add(extraClass);
    }

    paragraph.appendChild(span);
  }

  if (printable) {
    const button = document.createElement('BUTTON');
    button.addEventListener('click', () => {
      parentElement.classList.add('print');
      window.print();
      setTimeout(() => { parentElement.classList.remove('print'); }, 1000);
    });
    button.appendChild(document.createTextNode('Print'));
    paragraph.appendChild(button);
  }

  return paragraph;
}

/**
 * Creates and returns list item
 * @param {{textLine: string, extraClass: string, clickFunc: Function}[]} headerItems - Items to be appended to the header
 * @param {string[]} text - Item text
 * @param {boolean} printable - Should the item be printable
 * @returns {Element} List item
 */
function createItem({ headerItems, text, printable }) {
  const listItem = document.createElement('LI');
  listItem.appendChild(createHeader({ parentElement: listItem, headerItems, printable }));

  for (const line of text) {
    const paragraph = document.createElement('P');

    if (line === '') {
      paragraph.appendChild(document.createTextNode('\n'));
    }

    paragraph.appendChild(document.createTextNode(line));
    listItem.appendChild(paragraph);
  }

  return listItem;
}

class ItemList {
  constructor({ isTopDown = false }) {
    this.isTopDown = isTopDown;
    this.element = document.createElement('UL');
  }

  addItem({ headerItems, text, printable }) {
    const listItem = createItem({ headerItems, text, printable });

    if (this.isTopDown) {
      this.element.insertBefore(listItem, this.element.firstChild);
    } else {
      this.element.appendChild(listItem);
    }
  }

  addItems(items) {
    const fragment = document.createDocumentFragment();

    for (const item of items) {
      const listItem = createItem(item);

      if (this.isTopDown) {
        fragment.insertBefore(listItem, fragment.firstChild);
      } else {
        fragment.appendChild(createItem(item));
      }
    }

    if (this.isTopDown) {
      this.element.insertBefore(fragment, this.element.firstChild);
    } else {
      this.element.appendChild(fragment);
    }
  }

  appendTo(parentElement) {
    parentElement.appendChild(this.element);
  }
}

module.exports = ItemList;
