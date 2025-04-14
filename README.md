# 📸 CLARA – Smart Attendance System

**CLARA (Classroom Attendance Recognition Assistant)** is a face-recognition-based attendance management system that automates attendance marking from video input. It integrates:

- 🎥 Video capture & upload  
- 🤖 Facial recognition with `face_recognition`  
- 🧾 Google Sheets for attendance tracking  
- 📧 Email alerts for absent students  
- 🖥️ React + FastAPI full-stack architecture  

---

## 🌐 Live Tech Stack

### 🔧 Backend (FastAPI + MongoDB)

- FastAPI for building REST APIs  
- MongoDB (via `pymongo`) for storing teacher/student data and videos  
- Face recognition using `face_recognition`, `OpenCV`, and `NumPy`  
- Google Sheets API for attendance tracking  
- SMTP (via `smtplib`) for sending email alerts  
- Async video processing with `asyncio` and `BackgroundTasks`  

### 🎨 Frontend (React + TailwindCSS)

- React Router for navigation  
- Webcam-based video capture and preview  
- Student/teacher registration  
- Video upload and attendance trigger  
- View attendance via embedded Google Sheets  

---

## 🚀 Setup Instructions

### 📦 Backend Setup

- `cd backend`
- `python -m venv venv`
- `source venv/bin/activate` *(or `venv\Scripts\activate` on Windows)*
- `pip install -r requirements.txt`

### ⚙️ .env Configuration

Create a `.env` file inside the `backend/` folder with the following:

```env
mongo_uri=your_mongo_connection_string
SMTP_EMAIL=your_email@example.com
SMTP_PASSWORD=your_email_password
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
folder_id=your_drive_folder_id
```
🌐 Frontend Setup
```
cd frontend

npm install

npm run dev
```
✅ Features
```
Teacher Registration: Creates a dedicated Google Sheet per teacher and batch

Student Registration: Uploads multiple student images, generates face encodings

Video Recording: Record webcam video directly in the browser

Attendance Detection: Processes uploaded video and marks students present

Google Sheets Integration: Updates attendance data batch-wise

Email Notifications: Automatically emails absent students
```

🔐 Environment Requirements
```
Python 3.8+

Node.js v16+

MongoDB Atlas or local instance

Google Cloud project with Sheets API enabled

Valid SMTP credentials for email alerts
```

🙌 Credits
```
face_recognition

FastAPI

React

Google Sheets API
```
