/* eslint-disable require-jsdoc */
$(function() {
  // Peer object
  const peer = new Peer({
    key:   window.__SKYWAY_KEY__,
    debug: 3,
  });

  let localStream;
  let videoRoom, publicChatRoom, kosokosoRoom;
  let userName = 'anonymous';
  let role;
  const connectedPeers = {};

  peer.on('open', () => {
    $('#my-id').text(peer.id);
    // Get things started
    step1();
  });

  peer.on('error', err => {
    alert(err.message);
    // Return to step 2 if error occurs
    step2();
  });

  $('#make-call').on('submit', e => {
    e.preventDefault();
    // Initiate a call!
    const roomName = $('#join-room').val();
    role = $('input[name=myradio]:checked').val();
    userName = $('#yourname').val() + (role == 'teacher' ? '先生': '');

    if (!roomName) {
      return;
    }

    videoRoom = peer.joinRoom('mesh_video_' + roomName, {stream: localStream});
    publicChatRoom = peer.joinRoom('質問ルーム' + roomName + '_public', {stream: localStream});
    kosokosoRoom = peer.joinRoom('こそこそルーム' + roomName + '_kosokoso');
    
    //$('#room-id').text(roomName);
    step3(videoRoom);

    publicChatRoom.on('open', function() {
        connect(publicChatRoom);
        connectedPeers[roomName] = publicChatRoom;
    });

    kosokosoRoom.on('open', function() {
        if (role != 'teacher') {
          connect(kosokosoRoom);
        }
        connectedPeers[roomName] = kosokosoRoom;
    });
  });

  $('#send').on('submit', e => {
    e.preventDefault();
    // For each active connection, send the message.
    const msg = $('#text').val();

    eachActiveRoom((room, $c) => {
      const data = {
        name: userName,
        msg: msg
      };
      room.send(JSON.stringify(data));
      $c.find('.messages').append('<div><span class="you">' + userName + ': </span>' + msg
        + '</div>');
    });
    $('#text').val('');
    $('#text').focus();
  });

  $('#end-call').on('click', () => {
    videoRoom.close();
    publicChatRoom.close();
    kosokosoRoom.close();
    eachActiveRoom(function(room, $c) {
      room.close();
      $c.remove();
    });
    step2();
  });

  window.onunload = window.onbeforeunload = function(e) {
    if (!!peer && !peer.destroyed) {
      peer.destroy();
    }
  };

  // Retry if getUserMedia fails
  $('#step1-retry').on('click', () => {
    $('#step1-error').hide();
    step1();
  });

  // set up audio and video input selectors
  const audioSelect = $('#audioSource');
  const videoSelect = $('#videoSource');
  const selectors = [audioSelect, videoSelect];

  navigator.mediaDevices.enumerateDevices()
    .then(deviceInfos => {
      const values = selectors.map(select => select.val() || '');
      selectors.forEach(select => {
        const children = select.children(':first');
        while (children.length) {
          select.remove(children);
        }
      });

      for (let i = 0; i !== deviceInfos.length; ++i) {
        const deviceInfo = deviceInfos[i];
        const option = $('<option>').val(deviceInfo.deviceId);

        if (deviceInfo.kind === 'audioinput') {
          option.text(deviceInfo.label ||
            'Microphone ' + (audioSelect.children().length + 1));
          audioSelect.append(option);
        } else if (deviceInfo.kind === 'videoinput') {
          option.text(deviceInfo.label ||
            'Camera ' + (videoSelect.children().length + 1));
          videoSelect.append(option);
        }
      }

      selectors.forEach((select, selectorIndex) => {
        if (Array.prototype.slice.call(select.children()).some(n => {
            return n.value === values[selectorIndex];
          })) {
          select.val(values[selectorIndex]);
        }
      });

      videoSelect.on('change', step1);
      audioSelect.on('change', step1);
    });

  function step1() {
    // Get audio/video stream
    const audioSource = $('#audioSource').val();
    const videoSource = $('#videoSource').val();
    const constraints = {
      audio: {deviceId: audioSource ? {exact: audioSource} : undefined},
      video: {deviceId: videoSource ? {exact: videoSource} : undefined},
    };
    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
      $('#my-video').get(0).srcObject = stream;
      localStream = stream;

      if (videoRoom) {
        videoRoom.replaceStream(stream);
        return;
      }

      step2();
    }).catch(err => {
      $('#step1-error').show();
      console.error(err);
    });
  }

  function step2() {
    $('#step1, #step3').hide();
    $('#step2').show();
    //$('#join-room').focus();
  }

  function step3(room) {
    // Wait for stream on the call, then set peer video display
    room.on('stream', stream => {
      const peerId = stream.peerId;
      const id = 'video_' + peerId + '_' + stream.id.replace('{', '').replace('}', '');

      $('#their-videos').append($(
        '<div class="video_' + peerId +'" id="' + id + '">' +
          '<label>' + stream.peerId + ':' + stream.id + '</label>' +
          '<video class="remoteVideos">' +
        '</div>'));
      const el = $('#' + id).find('video').get(0);
      el.srcObject = stream;
      el.play();
    });

    room.on('removeStream', function(stream) {
      const peerId = stream.peerId;
      $('#video_' + peerId + '_' + stream.id.replace('{', '').replace('}', '')).remove();
    });

    // UI stuff
    room.on('close', step2);
    room.on('peerLeave', peerId => {
      $('.video_' + peerId).remove();
    });
    $('#step1, #step2').hide();
    $('#step3').show();
  }

  function connect(room) {
    // Handle a chat connection.
    $('#text').focus();
    const chatbox = $('<div></div>').addClass('connection').addClass('active').attr('id', room.name);
    const roomName = room.name.replace('sfu_text_', '');
    const header = $('<h1></h1>').html('Room: <strong>' + roomName + '</strong>');
    const messages = $('<div><em>Peer connected.</em></div>').addClass('messages');
    chatbox.append(header);
    chatbox.append(messages);
    // Select connection handler.
    chatbox.on('click', () => {
      chatbox.toggleClass('active');
    });

    $('.filler').hide();
    $('#connections').append(chatbox);

    room.getLog();
    room.once('log', logs => {
      for (let i = 0; i < logs.length; i++) {
        const log = JSON.parse(logs[i]);

        switch (log.messageType) {
          case 'ROOM_DATA':
           const data_json = JSON.parse(log.message.data);
            messages.append('<div><span class="peer">' + data_json.name + '</span>: ' + data_json.msg+ '</div>');
            break;
          case 'ROOM_USER_JOIN':
            if (log.message.src === peer.id) {
              break;
            }
            messages.append('<div><span class="peer">' + userName + '</span>: has joined the room </div>');
            break;
          case 'ROOM_USER_LEAVE':
            if (log.message.src === peer.id) {
              break;
            }
            messages.append('<div><span class="peer">' + userName + '</span>: has left the room </div>');
            break;
        }
      }
    });

    room.on('data', message => {
      if (message.data instanceof ArrayBuffer) {
        const dataView = new Uint8Array(message.data);
        const dataBlob = new Blob([dataView]);
        const url = URL.createObjectURL(dataBlob);
        messages.append('<div><span class="file">' +
          message.src + ' has sent you a <a target="_blank" href="' + url + '">file</a>.</span></div>');
      } else {
        const data = JSON.parse(message);
        messages.append('<div><span class="peer">' + data.name+ '</span>: ' + data.msg + '</div>');
      }
    });

    room.on('peerJoin', peerId => {
      messages.append('<div><span class="peer">' + userName + '</span>: has joined the room </div>');
    });

    room.on('peerLeave', peerId => {
      messages.append('<div><span class="peer">' + userName + '</span>: has left the room </div>');
    });
  }

  function eachActiveRoom(fn) {
    const actives = $('.active');
    const checkedIds = {};
    actives.each((_, el) => {
      const peerId = $(el).attr('id');
      if (!checkedIds[peerId]) {
        const room = peer.rooms[peerId];
        //fn(kosokosoRoom, $(el));
        if (role == 'teacher' && room == kosokosoRoom) {
          return;
        }
        fn(room, $(el));
      }
      checkedIds[peerId] = 1;
    });
  }
});
