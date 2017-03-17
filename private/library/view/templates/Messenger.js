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
const MessageList = require('../elements/MessageList');
const Message = require('../elements/Message');
const Viewer = require('../base/Viewer');
const List = require('../base/List');
const DialogBox = require('../DialogBox');

const keyHandler = require('../../KeyHandler');
const socketManager = require('../../SocketManager');
const storageManager = require('../../StorageManager');
const eventCentral = require('../../EventCentral');
const elementCreator = require('../../ElementCreator');
const viewTools = require('../../ViewTools');
const soundLibrary = require('../../audio/SoundLibrary');

/**
 * Retrieve history and trigger CHATMSG event
 * @param {string} roomName - Name of the room to retrieve history from
 * @param {number} lines - Number of lines to retrieve
 * @param {boolean} infiniteScroll Did infinite scroll trigger the history retrieval?
 */
function getHistory({ roomName, lines = 50, infiniteScroll = false }) {
  socketManager.emitEvent('history', { room: { roomName }, lines }, ({ data: historyData, error: historyError }) => {
    if (historyError) {
      console.log('history', historyError);

      return;
    }

    eventCentral.triggerEvent({
      event: eventCentral.Events.CHATMSG,
      params: {
        messages: historyData.messages,
        options: { printable: false },
        shouldScroll: !infiniteScroll,
        isHistory: true,
        infiniteScroll,
        following: historyData.following,
      },
    });
  });
}

class Messenger extends View {
  constructor({ isFullscreen, sendButtonText, isTopDown }) {
    super({ isFullscreen });

    this.element.setAttribute('id', 'messenger');
    this.inputField = document.createElement('TEXTAREA');
    this.inputField.setAttribute('rows', '3');
    this.inputField.addEventListener('input', () => { this.resizeInputField(); });
    this.selectedItem = null;
    this.messageList = new MessageList({ isTopDown });
    this.chatSelect = elementCreator.createContainer({ classes: ['list'] });

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
        this.focusInput();
      });

      reader.readAsDataURL(file);
    });

    const sendButton = elementCreator.createButton({
      func: () => { this.sendMessage(); },
      text: sendButtonText,
    });


    const imageButton = elementCreator.createButton({
      func: () => { imageInput.click(); },
      text: 'Pic',
      classes: ['hide'],
    });
    imageButton.appendChild(imageInput);
    this.accessElements.push({
      element: imageButton,
      accessLevel: 2,
    });

    const aliasDiv = document.createElement('DIV');
    const aliasList = elementCreator.createList({
      classes: ['list', 'hide'],
    });
    const aliasListButton = elementCreator.createButton({
      func: () => { aliasList.classList.toggle('hide'); },
      text: '-',
    });
    eventCentral.addWatcher({
      watcherParent: this,
      event: eventCentral.Events.ALIAS,
      func: ({ aliases }) => {
        if (aliases.length > 0) {
          const fragment = document.createDocumentFragment();
          const fullAliasList = [storageManager.getUserName()].concat(aliases);

          fullAliasList.forEach((alias) => {
            const row = document.createElement('LI');
            const button = elementCreator.createButton({
              func: () => {
                if (storageManager.getUserName() !== alias) {
                  storageManager.setSelectedAlias(alias);
                } else {
                  storageManager.removeSelectedAlias();
                }

                aliasListButton.replaceChild(document.createTextNode(`Alias: ${alias}`), aliasListButton.firstChild);
                aliasList.classList.toggle('hide');
              },
              text: alias,
            });

            row.appendChild(button);
            fragment.appendChild(row);
          });

          aliasList.innerHTML = ' '; // eslint-disable-line no-param-reassign
          aliasList.appendChild(fragment);

          elementCreator.setButtonText(aliasListButton, `Alias: ${storageManager.getSelectedAlias() || storageManager.getUserName() || ''}`);
        } else {
          aliasListButton.classList.add('hide');
        }
      },
    });
    aliasDiv.appendChild(aliasList);
    aliasDiv.appendChild(aliasListButton);
    this.accessElements.push({
      element: aliasDiv,
      accessLevel: 2,
    });

    const buttons = document.createElement('DIV');
    buttons.classList.add('buttons');

    buttons.appendChild(aliasDiv);
    buttons.appendChild(imageButton);
    buttons.appendChild(sendButton);

    this.inputArea = document.createElement('DIV');
    this.inputArea.classList.add('inputArea');
    this.inputArea.classList.add('hide');
    this.inputArea.appendChild(this.imagePreview);
    this.inputArea.appendChild(this.inputField);
    this.inputArea.appendChild(buttons);
    this.accessElements.push({
      element: this.inputArea,
      accessLevel: 1,
    });

    this.viewer = new Viewer({}).element;
    this.viewer.classList.add('selectedView');
    const container = elementCreator.createContainer({ classes: ['viewContainer'] });

    if (isTopDown) {
      this.inputArea.classList.add('topDown');
      this.viewer.appendChild(this.inputArea);
      this.viewer.appendChild(this.messageList.element);
    } else {
      this.inputArea.classList.add('bottomUp');
      this.viewer.appendChild(this.messageList.element);
      this.viewer.appendChild(this.inputArea);
    }

    this.viewer.addEventListener('mousewheel', () => {
      if (this.viewer.firstElementChild) {
        if (!this.messageList.isTopDown && viewTools.isCloseToTop(this.viewer.firstElementChild)) {
          // getHistory({ roomName: storageManager.getRoom() });
        }
      }
    });

    container.appendChild(this.chatSelect);
    container.appendChild(this.viewer);
    this.element.appendChild(container);

    eventCentral.addWatcher({
      watcherParent: this,
      event: eventCentral.Events.CHATMSG,
      func: ({ messages, options, shouldScroll, isHistory, following }) => {
        const itemsOptions = {
          animation: 'flash',
          shouldScroll,
          isHistory,
        };

        if (isHistory) {
          if (following) {
            this.inputArea.classList.remove('hide');
            this.messageList.element.classList.remove('fullHeight');
          } else {
            this.inputArea.classList.add('hide');
            this.messageList.element.classList.add('fullHeight');
          }
        }

        this.messageList.addItems(messages.map(message => new Message(message, options)), itemsOptions);
      },
    });

    eventCentral.addWatcher({
      watcherParent: this,
      event: eventCentral.Events.SWITCHROOM,
      func: ({ room }) => {
        this.messageList.element.classList.remove('flash');

        setTimeout(() => {
          this.messageList.element.innerHTML = '';
          this.messageList.element.classList.add('flash');

          getHistory({ roomName: room, switchedRoom: true });
        }, 100);
      },
    });
  }

  sendMessage() {
    if (this.inputField.value.trim() !== '') {
      const chatMsgData = {
        message: {
          text: this.inputField.value.split('\n'),
          roomName: storageManager.getRoom(),
        },
      };

      const imageSource = this.imagePreview.getAttribute('src');

      if (imageSource) {
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

      const selectedAlias = storageManager.getSelectedAlias();

      if (selectedAlias) { chatMsgData.message.userName = selectedAlias; }

      socketManager.emitEvent('chatMsg', chatMsgData, ({ data, error }) => {
        if (error) {
          console.log(error);

          return;
        }

        eventCentral.triggerEvent({ event: eventCentral.Events.CHATMSG, params: { messages: data.messages, options: { printable: false }, shouldScroll: true } });
        this.clearInputField();
      });
      this.focusInput();
    }
  }

  resizeInputField() {
    this.inputField.style.height = 'auto';
    this.inputField.style.height = `${this.inputField.scrollHeight}px`;
    this.viewer.scrollTop = this.viewer.scrollHeight;
  }

  clearInputField() {
    this.inputField.value = '';
    this.resizeInputField();
  }

  removeView() {
    keyHandler.removeKey(13);
    this.element.parentNode.classList.remove('messengerMain');
    super.removeView();

    this.messageList.element.classList.remove('flash');

    // forEach on childNodes does not work in iOS 7
    for (let i = 0; i < this.messageList.element.childNodes.length; i += 1) {
      const listItem = this.messageList.element.childNodes[i];

      listItem.classList.remove('flash');
    }
  }

  focusInput() {
    this.inputField.focus();
  }

  populateList() {
    this.chatSelect.innerHTML = '';

    socketManager.emitEvent('listRooms', {}, ({ error, data }) => {
      if (error) {
        console.log(error);

        return;
      }

      const { rooms = [], followedRooms = [], ownedRooms = [] } = data;
      const fragment = document.createDocumentFragment();

      fragment.appendChild(elementCreator.createButton({
        text: 'Create room',
        func: () => {
          const createDialog = new DialogBox({
            buttons: {
              left: {
                text: 'Cancel',
                eventFunc: () => {
                  createDialog.removeView();
                },
              },
              right: {
                text: 'Create',
                eventFunc: () => {
                  const emptyFields = createDialog.markEmptyFields();

                  if (emptyFields) {
                    soundLibrary.playSound('fail');
                    createDialog.changeExtraDescription({ text: ['You cannot leave obligatory fields empty!'] });

                    return;
                  }

                  socketManager.emitEvent('createRoom', {
                    room: {
                      roomName: createDialog.inputs.find(({ inputName }) => inputName === 'roomName').inputElement.value,
                      password: createDialog.inputs.find(({ inputName }) => inputName === 'password').inputElement.value,
                    },
                  }, ({ error: createError, data: roomData }) => {
                    if (createError) {
                      console.log(createError);

                      return;
                    }

                    eventCentral.triggerEvent({
                      event: eventCentral.Events.CREATEROOM,
                      params: { room: { roomName: roomData.room.roomName } },
                    });
                    eventCentral.triggerEvent({
                      event: eventCentral.Events.FOLLOWROOM,
                      params: { room: { roomName: roomData.room.roomName } },
                    });
                    createDialog.removeView();
                  });
                },
              },
            },
            inputs: [{
              placeholder: 'Name of the room',
              inputName: 'roomName',
              isRequired: true,
            }, {
              placeholder: 'Optional passowrd',
              inputName: 'password',
            }],
            description: ['Employees are strictly prohibited from having more than 5% fun in their group room.'],
            extraDescription: ['Enter a name and optional password for the room'],
          });
          createDialog.appendTo(this.element.parentElement);
        },
      }));

      if (ownedRooms.length > 0) {
        const ownedList = this.createList({ rooms: ownedRooms, title: 'Yours', shouldSort: false });

        eventCentral.addWatcher({
          watcherParent: ownedList,
          event: eventCentral.Events.CREATEROOM,
          func: ({ room: { roomName } }) => {
            ownedList.addItem({
              listItem: elementCreator.createButton({
                text: roomName,
                func: () => {
                  storageManager.setRoom(roomName);
                },
              }),
            });
          },
        });

        fragment.appendChild(ownedList.element);
      }
      if (followedRooms.length > 0) {
        const followList = this.createList({ rooms: followedRooms, title: 'Following', shouldSort: false });

        eventCentral.addWatcher({
          watcherParent: followList,
          event: eventCentral.Events.FOLLOWROOM,
          func: ({ room: { roomName } }) => {
            followList.addItem({
              listItem: elementCreator.createButton({
                text: roomName,
                func: () => {
                  storageManager.setRoom(roomName);
                },
              }),
            });
          },
        });

        fragment.appendChild(followList.element);
      }
      if (rooms.length > 0) { fragment.appendChild(this.createList({ rooms, title: 'Rooms', shouldSort: true }).element); }
      this.chatSelect.appendChild(fragment);
    });
  }

  appendTo(parentElement) {
    keyHandler.addKey(13, () => { this.sendMessage(); });
    super.appendTo(parentElement);
    this.messageList.scroll();
  }

  createList({ rooms, title, shouldSort }) {
    return new List({
      title,
      shouldSort: shouldSort || false,
      listItems: rooms.map((room) => {
        const button = elementCreator.createButton({
          text: room,
          func: () => {
            if (this.selectedItem) {
              this.selectedItem.classList.remove('selectedItem');
            }

            this.selectedItem = button.parentElement;
            this.selectedItem.classList.add('selectedItem');
            storageManager.setRoom(room);
          },
        });

        return button;
      }),
    });
  }
}

module.exports = Messenger;
