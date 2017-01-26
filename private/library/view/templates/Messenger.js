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

const View = require('../base/View');
const ItemList = require('../elements/MessageList');
const Message = require('../elements/Message');
const DialogBox = require('../DialogBox');

class Messenger extends View {
  constructor({ isFullscreen, socketManager, sendButtonText, isTopDown, keyHandler }) {
    super({ isFullscreen });

    this.keyHandler = keyHandler;
    this.keyHandler.addKey(13, () => { this.sendMessage(); });

    this.socketManager = socketManager;
    this.element.setAttribute('id', 'messenger');

    this.inputField = document.createElement('TEXTAREA');
    this.inputField.setAttribute('rows', '3');
    this.inputField.addEventListener('input', () => { this.resizeInputField(); });

    this.messageList = new ItemList({ isTopDown });

    this.imagePreview = new Image();
    this.imagePreview.classList.add('hide');

    const imageInput = document.createElement('INPUT');
    imageInput.classList.add('hide');
    imageInput.setAttribute('type', 'file');
    imageInput.setAttribute('accept', 'image/png, image/jpeg');
    imageInput.addEventListener('change', () => {
      const file = imageInput.files[0];
      const reader = new FileReader();

      reader.addEventListener('load', () => {
        this.imagePreview.classList.remove('hide');
        this.imagePreview.setAttribute('src', reader.result);
        this.imagePreview.setAttribute('name', file.name);
        this.imagePreview.classList.add('imagePreview');
        this.inputField.focus();
      });

      reader.readAsDataURL(file);
    });

    const sendButton = document.createElement('BUTTON');
    sendButton.appendChild(document.createTextNode(sendButtonText));
    sendButton.addEventListener('click', () => {
      this.sendMessage();
    });

    const imageButton = document.createElement('BUTTON');
    imageButton.appendChild(document.createTextNode('Bild'));
    imageButton.appendChild(imageInput);
    imageButton.addEventListener('click', () => {
      imageInput.click();
    });
    imageButton.classList.add('hide');
    this.accessElements.push({
      element: imageButton,
      accessLevel: 2,
    });

    const buttons = document.createElement('DIV');
    buttons.classList.add('buttons');

    const aliasButton = document.createElement('BUTTON');
    aliasButton.appendChild(document.createTextNode('Alias'));

    aliasButton.addEventListener('click', () => {
      const dialog = new DialogBox({
        buttons: {
          left: {
            text: 'Avbryt',
            eventFunc: () => {
              this.removeView();
            },
          },
          right: {
            text: 'Skapa',
            eventFunc: () => {
              console.log('Skapa', dialog.markEmptyFields(), dialog.inputs.get('alias').value);
              if (!dialog.markEmptyFields()) {
                socketManager.emitEvent('addAlias', { alias: dialog.inputs.get('alias').value }, (err, aliases) => {
                  if (err) {
                    if (err.text) {
                      dialog.changeExtraDescription({ text: err.text });
                    }

                    return;
                  }


                });
              }
            },
          },
        },
        description: [
          'Skriv in ett nytt alias. Ni kommer kunna välja att skicka meddelande med detta alias istället för ert användarnamn',
          'Skriv in ett av dina existerande alias om ni vill ändra det',
        ],
        parentElement: this.element.parentElement,
        inputs: [{
          placeholder: 'Alias',
          inputName: 'alias',
          required: true,
        }],
        keyHandler,
      });
      dialog.appendTo(this.element.parentElement);
    });
    aliasButton.classList.add('hide');
    this.accessElements.push({
      element: aliasButton,
      accessLevel: 2,
    });

    buttons.appendChild(aliasButton);
    buttons.appendChild(imageButton);
    buttons.appendChild(sendButton);

    const inputArea = document.createElement('DIV');
    inputArea.classList.add('inputArea');
    inputArea.appendChild(this.imagePreview);
    inputArea.appendChild(this.inputField);
    inputArea.appendChild(buttons);

    if (isTopDown) {
      inputArea.classList.add('topDown');
      this.element.appendChild(inputArea);
      this.element.appendChild(this.messageList.element);
    } else {
      inputArea.classList.add('bottomUp');
      this.element.appendChild(this.messageList.element);
      this.element.appendChild(inputArea);
    }
  }

  sendMessage() {
    if (this.inputField.value.trim() !== '') {
      const chatMsgData = {
        message: {
          text: this.inputField.value.split('\n'),
          roomName: 'public' },
      };

      const imageSource = this.imagePreview.getAttribute('src');

      if (imageSource) {
        console.log(this.imagePreview.getAttribute('name'), this.imagePreview.width, this.imagePreview.height);

        chatMsgData.image = {
          source: imageSource,
          imageName: this.imagePreview.getAttribute('name'),
          width: this.imagePreview.naturalWidth,
          height: this.imagePreview.naturalHeight,
        };

        this.imagePreview.removeAttribute('src');
        this.imagePreview.removeAttribute('name');
        this.imagePreview.classList.add('hide');
      }

      this.socketManager.emitEvent('chatMsg', chatMsgData, ({ data, error }) => {
        if (error) {
          console.log(error);

          return;
        }

        this.messageList.addItem(new Message(data.message, { printable: true }));
        this.clearInputField();
      });
      this.inputField.focus();
    }
  }

  addMessage(message, options) {
    this.messageList.addItem(new Message(message, options));
  }

  addMessages({ messages, options, shouldScroll }) {
    const convertedMessages = messages.map(message => new Message(message, options));

    this.messageList.addItems(convertedMessages, shouldScroll);
  }

  resizeInputField() {
    this.inputField.style.height = 'auto';
    this.inputField.style.height = `${this.inputField.scrollHeight + 10}px`;
  }

  clearInputField() {
    this.inputField.value = '';
    this.resizeInputField();
  }

  removeView() {
    this.keyHandler.removeKey(13);
    super.removeView();
  }
}

module.exports = Messenger;
