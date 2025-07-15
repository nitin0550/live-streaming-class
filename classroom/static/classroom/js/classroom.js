// This file will contain the JavaScript code for the classroom.html template.

// User and connection setup are now defined in the HTML template.
// const username = "{{ username }}";
// const roomCode = "{{ room_code }}";
// const isTeacher = {{ is_teacher|yesno:'true,false' }};

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${wsProtocol}//${window.location.host}/ws/classroom/${roomCode}/`);

const config = { 
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ] 
};

// Global variables
// For student:
let teacherPeerConnection; // For receiving stream FROM teacher
let studentSendConnection; // For sending stream TO teacher

// For teacher:
let teacherPeerConnections = {}; // Keyed by username, for SENDING teacher stream TO students
let studentPeerConnections = {}; // Keyed by username, for RECEIVING student streams

let localStream; // Can be teacher's or student's own stream
let teacherStream; // To hold the stream from the teacher

// UI Elements
const teacherVideo = document.getElementById('teacher-video');
const startMicBtn = document.getElementById('startMicBtn');
const startWebcamBtn = document.getElementById('startWebcamBtn');
const startScreenBtn = document.getElementById('startScreenBtn');

// --- Pre-flight Checks ---
function runPreflightChecks() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const errorMsg = "MediaDevices API not supported. Please use a modern browser and ensure you are on a secure (HTTPS) connection.";
        showError(errorMsg);
        // Disable all media buttons
        const mediaButtons = document.querySelectorAll('.controls button, #student-controls button');
        mediaButtons.forEach(btn => btn.disabled = true);
        return false;
    }
    return true;
}
// --- End Pre-flight Checks ---


// Error handling
function showError(message) {
    const errorContainer = document.getElementById('error-container');
    errorContainer.innerHTML = `<div class="error-message">${message}</div>`;
    console.error('Error:', message);
    setTimeout(() => {
        errorContainer.innerHTML = '';
    }, 5000);
}

function showSuccess(message) {
    const errorContainer = document.getElementById('error-container');
    errorContainer.innerHTML = `<div class="success-message">${message}</div>`;
    console.log('Success:', message);
    setTimeout(() => {
        errorContainer.innerHTML = '';
    }, 3000);
}

// WebSocket connection
socket.onopen = () => {
    console.log('WebSocket connected');
    if (runPreflightChecks()) {
        socket.send(JSON.stringify({ type: "join", username: username, is_teacher: isTeacher }));
        showSuccess('Connected to classroom!');
    }
};

socket.onclose = (event) => {
    console.log('WebSocket disconnected, code:', event.code, 'reason:', event.reason);
    showError('Disconnected from classroom. Please refresh the page.');
};

socket.onerror = (error) => {
    console.error('WebSocket error:', error);
    showError('Connection error occurred.');
};

socket.onmessage = async function (e) {
    try {
        const data = JSON.parse(e.data);
        console.log("WS received:", data);

        switch(data.type) {
            case "teacher_is_live":
                if (!isTeacher) {
                    console.log("Teacher is live, requesting stream.");
                    socket.send(JSON.stringify({ type: "request_stream" }));
                }
                break;
            case "student_requesting_stream":
                if (isTeacher) {
                    await createTeacherPeerConnection(data.from_user);
                }
                break;
            case "offer":
                if (!isTeacher) {
                    await handleTeacherOffer(data.offer, data.from_user);
                }
                break;
            case "answer":
                if (isTeacher) {
                    // This is an answer from a student to the teacher's offer
                    await handlePeerAnswer(teacherPeerConnections[data.from_user], data.answer);
                }
                break;
            // Student sends offer, teacher receives
            case "student_offer":
                if (isTeacher) {
                    await handleStudentOffer(data.offer, data.from_user);
                }
                break;
            // Teacher sends answer to student's offer
            case "student_answer":
                if (!isTeacher && studentSendConnection) {
                    // This is an answer from the teacher to the student's offer
                    await handlePeerAnswer(studentSendConnection, data.answer);
                }
                break;
            case "ice_candidate":
                handleIceCandidate(data);
                break;
            case "chat_message":
                displayChatMessage(data.username, data.message);
                break;
            case "student_list":
                updateStudentList(data.students);
                break;
            case "permission_granted":
                if (!isTeacher) {
                    handlePermissionGranted(data.permission, data.status);
                }
                break;
            case "user_left":
                handleUserLeft(data.username);
                break;
            case "stream_stopped":
                handleStreamStopped(data.username, data.is_teacher);
                break;
        }
    } catch (error) {
        console.error('Error processing WebSocket message:', error);
        showError('Error processing message from server.');
    }
};

// Generic Answer Handler
async function handlePeerAnswer(peerConnection, answer) {
    if (peerConnection && peerConnection.currentRemoteDescription == null) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log("Set remote description successfully");
        } catch (error) {
            console.error("Error setting remote description:", error);
            showError("Failed to establish connection.");
        }
    }
}

function handleIceCandidate(data) {
    const { from_user, candidate, is_teacher_stream } = data;
    let pc;

    if (isTeacher) {
        // Teacher receives a candidate from a student
        if (is_teacher_stream) {
            // Candidate is for the connection where teacher STREAMS TO student
            pc = teacherPeerConnections[from_user];
        } else {
            // Candidate is for the connection where teacher RECEIVES FROM student
            pc = studentPeerConnections[from_user];
        }
    } else {
        // Student receives a candidate from the teacher
        if (is_teacher_stream) {
            // Candidate for the stream coming FROM the teacher
            pc = teacherPeerConnection;
        } else {
            // Candidate for the stream student is sending TO the teacher
            pc = studentSendConnection;
        }
    }

    if (pc && candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
            console.error("Error adding received ICE candidate", e);
            showError("Error adding ICE candidate.");
        });
    }
}


// --- Teacher Logic ---

async function startTeacherStream(type = 'camera') {
    const constraints = type === 'screen' 
        ? { video: { cursor: "always" }, audio: true }
        : { video: true, audio: true };

    if (!isTeacher) return;
    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        teacherVideo.srcObject = localStream;
        
        // Notify server that teacher is ready to stream
        socket.send(JSON.stringify({ type: "teacher_ready" }));
        showSuccess('Stream started. Students can now request to view.');

    } catch (error) {
        console.error("Stream error:", error);
        showError("Failed to start stream: " + error.message);
    }
}

// This is called when a student requests the stream
async function createTeacherPeerConnection(forUser) {
    try {
        const pc = new RTCPeerConnection(config);
        teacherPeerConnections[forUser] = pc; // Store connection for SENDING

        // Add teacher's local stream tracks to the new connection
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        } else {
            showError("Teacher stream is not active. Cannot connect student.");
            return;
        }

        pc.onicecandidate = event => {
            if (event.candidate) {
                socket.send(JSON.stringify({ 
                    type: "ice_candidate", 
                    candidate: event.candidate,
                    target_user: forUser,
                    is_teacher_stream: true
                }));
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.send(JSON.stringify({ 
            type: "offer", 
            offer: offer,
            target_user: forUser
        }));

    } catch (error) {
        console.error(`Error creating peer connection for ${forUser}:`, error);
        showError(`Failed to initiate stream for ${forUser}.`);
    }
}

function stopTeacherStream() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        teacherVideo.srcObject = null;
        
        // Close all connections TO students
        Object.values(teacherPeerConnections).forEach(pc => pc.close());
        teacherPeerConnections = {};
        // Close all connections FROM students
        Object.values(studentPeerConnections).forEach(pc => pc.close());
        studentPeerConnections = {};

        socket.send(JSON.stringify({ type: "stream_stopped", is_teacher: true }));
        showSuccess('Teacher stream stopped.');
    }
}

// --- Student Logic ---

// Handle the offer from the teacher to receive their stream
async function handleTeacherOffer(offer, fromUser) {
    try {
        teacherPeerConnection = new RTCPeerConnection(config);
        teacherPeerConnection.ontrack = event => {
            teacherStream = event.streams[0];
            teacherVideo.srcObject = teacherStream;
        };

        teacherPeerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.send(JSON.stringify({ 
                    type: "ice_candidate", 
                    candidate: event.candidate,
                    target_user: fromUser, // The teacher
                    is_teacher_stream: true
                }));
            }
        };

        await teacherPeerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await teacherPeerConnection.createAnswer();
        await teacherPeerConnection.setLocalDescription(answer);

        socket.send(JSON.stringify({ 
            type: "answer", 
            answer: answer,
            target_user: fromUser
        }));

    } catch (error) {
        console.error("Error handling teacher offer:", error);
        showError("Failed to receive teacher's stream.");
    }
}

// Student starts their own media (mic, webcam, or screen share)
async function startStudentMedia(type) {
    if (isTeacher) return;

    let constraints;
    if (type === 'mic') {
        constraints = { audio: true, video: false };
    } else if (type === 'webcam') {
        constraints = { audio: true, video: true };
    } else if (type === 'screen') {
        constraints = { audio: true, video: { cursor: "always" } };
    } else {
        return;
    }

    try {
        // Stop existing stream before starting a new one
        if (localStream) {
            stopStudentStream();
        }

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Create a new peer connection for sending the stream to the teacher
        studentSendConnection = new RTCPeerConnection(config);

        localStream.getTracks().forEach(track => {
            studentSendConnection.addTrack(track, localStream);
        });

        studentSendConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.send(JSON.stringify({
                    type: "ice_candidate",
                    candidate: event.candidate,
                    target_user: "teacher", // Always send to teacher
                    is_teacher_stream: false // This is a student stream
                }));
            }
        };

        const offer = await studentSendConnection.createOffer();
        await studentSendConnection.setLocalDescription(offer);

        socket.send(JSON.stringify({
            type: "student_offer",
            offer: offer
        }));

        showSuccess(`Your ${type} has been started.`);

    } catch (error) {
        console.error(`Error starting student ${type}:`, error);
        showError(`Failed to start your ${type}: ${error.message}`);
    }
}

function startMic() {
    startStudentMedia('mic');
}

function startStudentWebcam() {
    startStudentMedia('webcam');
}

function startStudentScreen() {
    startStudentMedia('screen');
}

function stopStudentStream() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (studentSendConnection) {
        studentSendConnection.close();
        studentSendConnection = null;
    }
    // Also remove the video element if it exists
    const myVideo = document.getElementById(`video-${username}`);
    if (myVideo) {
        myVideo.parentElement.remove();
    }
    socket.send(JSON.stringify({ type: "stream_stopped", is_teacher: false }));
    showSuccess('Your stream has been stopped.');
}

// Teacher handles an offer from a student
async function handleStudentOffer(offer, fromUser) {
    try {
        const pc = new RTCPeerConnection(config);
        studentPeerConnections[fromUser] = pc; // Store connection for RECEIVING

        pc.ontrack = event => {
            // A student's stream is received
            const studentVideoContainer = document.getElementById('student-video-area');
            let videoWrapper = document.getElementById(`video-wrapper-${fromUser}`);
            if (!videoWrapper) {
                videoWrapper = document.createElement('div');
                videoWrapper.className = 'student-video';
                videoWrapper.id = `video-wrapper-${fromUser}`;
                videoWrapper.innerHTML = `
                    <p>${fromUser}</p>
                    <video id="video-${fromUser}" autoplay playsinline></video>
                `;
                studentVideoContainer.appendChild(videoWrapper);
            }
            const videoEl = document.getElementById(`video-${fromUser}`);
            videoEl.srcObject = event.streams[0];
        };

        pc.onicecandidate = event => {
            if (event.candidate) {
                socket.send(JSON.stringify({
                    type: "ice_candidate",
                    candidate: event.candidate,
                    target_user: fromUser,
                    is_teacher_stream: false
                }));
            }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.send(JSON.stringify({
            type: "student_answer",
            answer: answer,
            target_user: fromUser
        }));

    } catch (error) {
        console.error(`Error handling student offer from ${fromUser}:`, error);
        showError(`Failed to receive stream from ${fromUser}.`);
    }
}


// --- UI and General Logic ---

function handlePermissionGranted(permission, status) {
    showSuccess(`Permission for ${permission} has been ${status ? 'granted' : 'revoked'}.`);
    if (permission === 'audio') {
        startMicBtn.disabled = !status;
    } else if (permission === 'video') {
        startWebcamBtn.disabled = !status;
    } else if (permission === 'screen') {
        startScreenBtn.disabled = !status;
    }
}

function handleUserLeft(user) {
    showError(`${user} has left the classroom.`);
    // Teacher cleans up connections
    if (isTeacher) {
        if (teacherPeerConnections[user]) {
            teacherPeerConnections[user].close();
            delete teacherPeerConnections[user];
        }
        if (studentPeerConnections[user]) {
            studentPeerConnections[user].close();
            delete studentPeerConnections[user];
        }
    }
    // Remove student video if it exists
    const studentVideo = document.getElementById(`video-wrapper-${user}`);
    if (studentVideo) {
        studentVideo.remove();
    }
}

function handleStreamStopped(user, isStreamFromTeacher) {
    if (isStreamFromTeacher) {
        teacherVideo.srcObject = null;
        showError("Teacher has stopped the stream.");
        if (teacherPeerConnection) {
            teacherPeerConnection.close();
            teacherPeerConnection = null;
        }
    } else {
        // A student stopped their stream
        const studentVideo = document.getElementById(`video-wrapper-${user}`);
        if (studentVideo) {
            studentVideo.remove();
        }
        if (isTeacher && studentPeerConnections[user]) {
            studentPeerConnections[user].close();
            delete studentPeerConnections[user];
        }
        showSuccess(`${user} has stopped their stream.`);
    }
}

function updateStudentList(students) {
    const studentList = document.getElementById('student-list');
    const participantCount = document.getElementById('participant-count');
    studentList.innerHTML = '';
    participantCount.innerText = students.length;

    students.forEach(student => {
        const studentEl = document.createElement('div');
        studentEl.className = 'participant-item';
        studentEl.id = `student-${student.username}`;
        
        let controls = '';
        if (isTeacher) {
            controls = `
                <div class="participant-controls">
                    <button onclick="togglePermission('${student.username}', 'audio', ${!student.permissions.audio})">
                        ${student.permissions.audio ? 'Mute Mic' : 'Allow Mic'}
                    </button>
                    <button onclick="togglePermission('${student.username}', 'video', ${!student.permissions.video})">
                        ${student.permissions.video ? 'Block Cam' : 'Allow Cam'}
                    </button>
                    <button onclick="togglePermission('${student.username}', 'screen', ${!student.permissions.screen})">
                        ${student.permissions.screen ? 'Block Screen' : 'Allow Screen'}
                    </button>
                </div>
            `;
        }

        studentEl.innerHTML = `
            <span>${student.username}</span>
            ${controls}
        `;
        studentList.appendChild(studentEl);
    });
}

function togglePermission(user, permission, status) {
    if (!isTeacher) return;
    socket.send(JSON.stringify({
        type: 'grant_permission',
        target_user: user,
        permission: permission,
        status: status
    }));
}

// Chat functionality
function sendMessage() {
    const input = document.getElementById('chat-message-input');
    const message = input.value.trim();
    if (message) {
        socket.send(JSON.stringify({ type: 'chat_message', message: message }));
        input.value = '';
    }
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function displayChatMessage(user, message) {
    const chatBox = document.getElementById('chat-box');
    const msgEl = document.createElement('div');
    msgEl.innerHTML = `<strong>${user}:</strong> ${message}`;
    chatBox.appendChild(msgEl);
    chatBox.scrollTop = chatBox.scrollHeight; // Scroll to bottom
}

// Run on page load
window.onload = () => {
    // Any initial setup can go here
};
