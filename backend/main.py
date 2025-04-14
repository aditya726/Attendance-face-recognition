from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from passlib.context import CryptContext
from typing import List
import os
from pydantic import BaseModel
import face_recognition
import numpy as np
import cv2
import time
import asyncio
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import gspread
from gspread_formatting import format_cell_range, CellFormat, Color
from gspread import Cell
from google.oauth2.service_account import Credentials
from oauth2client.service_account import ServiceAccountCredentials
import datetime
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


load_dotenv()
app = FastAPI()
app.state.processtime = 0

uri = os.getenv("mongo_uri")
# Create a new client and connect to the server
MONGODB = MongoClient(uri, server_api=ServerApi('1'))
# Path to your service account JSON file (store securely!)

    
# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authenticate with Google Sheets API
scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds = ServiceAccountCredentials.from_json_keyfile_name("attendance.json", scope)
gsclient = gspread.authorize(creds)

# MongoDB connection
db = MONGODB["AttendanceSystem"]
teachers = db["teachers"]
students = db["students"]
videos = db["videos"]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@app.get("/")
async def root():
    return {"message": "Welcome to CLARA"}

class TeacherLogin(BaseModel):
    username : str
    password: str

class TeacherRegister(BaseModel):
    id: str
    name: str
    password: str
    classes: List[str]

async def process_class(spreadsheet, cls: str):
    batch_offsets = {'e': 0, 'f': 23, 'g': 46, 'h': 69}
    # Header: "Roll number" in A1 and 50 blank cells for date columns
    header = [["Roll number"] + [""] * 50]
    try:
        # Create new worksheet (adjust rows/cols as needed)
        worksheet = await asyncio.to_thread(spreadsheet.add_worksheet, title=cls, rows=100, cols=51)
        # Update header in the new worksheet
        await asyncio.to_thread(worksheet.update, "A1", header)
        if len(cls) < 3:
            print(f"Invalid class format: {cls}")
            return
        grade, batch, section = cls[0], cls[1].lower(), cls[2]
        offset = batch_offsets.get(batch)
        if offset is None:
            print(f"Unknown batch letter in class {cls}")
            return
        # Generate roll numbers for 23 students
        roll_numbers = [[f"{grade}1{section}{offset + i:02d}"] for i in range(1, 24)]
        # Update roll numbers starting from cell A2
        await asyncio.to_thread(worksheet.update, "A2", roll_numbers)
    except Exception as e:
        print(f"Error processing class {cls}: {e}")

@app.post("/teacher")
async def register_teacher(teacher: TeacherRegister):
    try:
        if teachers.find_one({"teacher_id": teacher.id}):
            raise HTTPException(400, "Teacher already registered")
        teachers.insert_one({
            "teacher_id": teacher.id,
            "name": teacher.name,
            "password": pwd_context.hash(teacher.password)
        })
        spreadsheet_name = f"{teacher.id}_{teacher.name}"
        folder_id = os.getenv("folder_id")
        # Create the spreadsheet (wrapped in asyncio.to_thread)
        spreadsheet = await asyncio.to_thread(gsclient.create, spreadsheet_name, folder_id=folder_id)
        # Process each class concurrently
        await asyncio.gather(*(process_class(spreadsheet, cls) for cls in teacher.classes))
        await asyncio.to_thread(spreadsheet.del_worksheet, spreadsheet.sheet1)
        return {"message": "Teacher registered successfully", "DB": spreadsheet_name}
    except Exception as e:
        print(f"Error in register_teacher: {e}")
        raise HTTPException(500, f"Internal Server Error: {e}")

@app.post("/login")
async def login(teacher: TeacherLogin):
    print(teacher)
    db_teacher = teachers.find_one({"name": teacher.username})
    if not db_teacher:
        raise HTTPException(status_code=400, detail="Invalid username")
    if not pwd_context.verify(teacher.password, db_teacher["password"]):
        raise HTTPException(status_code=400, detail="Invalid password")
    return {"message": "Login successful", "Id : ": db_teacher["name"]}

@app.post("/student")
async def register_student(
    name: str = Form(...),
    roll: str = Form(...),
    batch: str = Form(...),
    email : str = Form(...),
    images: List[UploadFile] = File(...)
):
    if students.find_one({"roll": roll}):
        raise HTTPException(status_code=400, detail="Student already registered")

    image_paths = []
    encodings = []
    os.makedirs("uploads/student_images", exist_ok=True)
    for image in images:
        image_path = f"uploads/student_images/{roll}_{image.filename}"
        with open(image_path, "wb") as f:
            f.write(await image.read())
        image_paths.append(image_path)

        img = face_recognition.load_image_file(image_path)
        encoding_list = face_recognition.face_encodings(img)
        if encoding_list:
            encodings.append(encoding_list[0].tolist())
        else:
            print(f"Warning: No face detected in image {image_path}")

    student_data = {
        "name": name,
        "roll": roll,
        "batch": batch,
        "image_paths": image_paths,
        "Email": email,
        "encodings": encodings
    }
    students.insert_one(student_data)
    return {"message": "Student registered successfully"}

@app.post("/video")
async def upload_video(
    id: str = Form(...),
    batch: str = Form(...),
    video: UploadFile = File(...)
):
    # Verify teacher exists
    teacher = teachers.find_one({"teacher_id": id})
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    # Save video to disk
    os.makedirs("uploads/videos", exist_ok=True)
    video_path = f"uploads/videos/{id}_{batch}_{video.filename}"
    with open(video_path, "wb") as f:
        f.write(await video.read())

    # Store video metadata in MongoDB
    video_data = {
        "teacher_id": id,
        "batch": batch,
        "video_path": video_path,
        "status": "pending"
    }
    db["videos"].insert_one(video_data)

    return {"message": "Video uploaded successfully"}

@app.post("/flow")
async def process_videos(background_tasks: BackgroundTasks):
    scan_videos = list(videos.find({"status": "pending"}))
    if not scan_videos:
        raise HTTPException(status_code=404, detail="No videos found")
    
    for video_data in scan_videos:
        Flag = background_tasks.add_task(process_video_task, video_data["teacher_id"], video_data["video_path"], video_data["batch"], video_data["_id"])
        videos.update_one({"_id": video_data["_id"]}, {"$set": {"status": "processing"}})
        if Flag:
            return {"status":Flag}

    return {"message": f"Video processing started for {len(scan_videos)} video/videos."}

async def process_video_task(teacher_id, video_path, batch, video_id):
    try:
        start_time = time.time()
        
        # Load student encodings
        pstudents = list(students.find({"batch": batch}))
        known_face_encodings = []
        known_face_names = []
        detected_students = set()

        for student in pstudents:
            encodings = student.get("encodings", [])
            if encodings:
                for enc in encodings:
                    known_face_encodings.append(np.array(enc))
                    known_face_names.append(student["roll"])

        if not known_face_encodings:
            print(f"No encodings found for batch {batch}")
            videos.update_one({"_id": video_id}, {"$set": {"status": "failed"}})
            return False

        # Process video with minimal frames
        video_capture = cv2.VideoCapture(video_path)
        total_frames = int(video_capture.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = video_capture.get(cv2.CAP_PROP_FPS)
        frame_count = 0
        processed_frames = 0
        frames_per_second = 10 # Processed frames per second
        max_frames_to_process = max(int((total_frames//max(fps,30)) * frames_per_second) , 30)

        print(f"Starting video: {video_path}, FPS: {fps}, Total Frames: {total_frames}")

        while video_capture.isOpened() and processed_frames < min(max_frames_to_process, total_frames):
            # Jump to specific frames (e.g., start and middle)
            target_frame = int(total_frames * (processed_frames / max_frames_to_process))
            video_capture.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
            ret, frame = video_capture.read()
            if not ret:
                break

            # Optimize frame
            frame = cv2.resize(frame, (960, 540))  # Even smaller for speed
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # Ensure RGB explicitly
            
            # Keep the processing frame line as requested
            print(f"Processing frame {target_frame}")
            frame_start = time.time()

            # Face detection and encoding
            face_locations = face_recognition.face_locations(rgb_frame, model="hog")
            if face_locations:
                face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)
                for face_encoding in face_encodings:
                    if len(detected_students) == len(set(known_face_names)):
                        break
                    
                    matches = face_recognition.compare_faces(known_face_encodings, face_encoding, tolerance=0.5)
                    roll = "Unknown"
                    if True in matches:
                        first_match_index = matches.index(True)
                        roll = known_face_names[first_match_index]
                        if roll != "Unknown" and roll not in detected_students:
                            detected_students.add(roll)
                            print(f"{roll} detected in {time.time() - frame_start:.2f}s")
            
            processed_frames += 1

        video_capture.release()

        # Final processing and cleanup
        if os.path.exists(video_path):
            os.remove(video_path)
        total_time = time.time() - start_time
        app.state.processtime += total_time
        
        # Update attendance sheet
        update_attendance_sheet(teacher_id, batch, datetime.datetime.now().strftime("%Y-%m-%d"), list(detected_students))
        print(f"Finished video for batch {batch} in {app.state.processtime:.2f}s. Detected: {detected_students}")
        
        # Update database status before removing
        videos.update_one({"_id": video_id}, {"$set": {"status": "completed"}})
        videos.delete_one({"_id": video_id})
        
        return True if detected_students else False
    
    except Exception as e:
        print(f"Error processing video {video_id}: {str(e)}")
        videos.update_one({"_id": video_id}, {"$set": {"status": "failed", "error": str(e)}})
        return False
   
def update_attendance_sheet(id, batch, date, present_students):
    try:
        # Find teacher details
        teacher = teachers.find_one({"teacher_id": id})
        if not teacher:
            raise Exception("Teacher not found")
        
        # Open the teacher's spreadsheet
        spreadsheet_name = f"{id}_{teacher['name']}"
        spreadsheet = gsclient.open(spreadsheet_name)

        # Find or create the batch-specific worksheet
        try:
            sheet = spreadsheet.worksheet(batch)
        except gspread.exceptions.WorksheetNotFound:
            sheet = spreadsheet.add_worksheet(title=batch, rows=100, cols=20)
            sheet.update_cell(1, 1, "Roll Number")
        
        # Ensure header row is correctly set up
        header_row = sheet.row_values(1)
        if date not in header_row:
            date_column = len(header_row) + 1
            sheet.update_cell(1, date_column, date)
        else:
            date_column = header_row.index(date) + 1
        
        # Get existing roll numbers
        current_roll_numbers = sheet.col_values(1)[1:]  # Skip header

        # Append any new roll numbers
        new_rolls = [roll for roll in present_students if roll not in current_roll_numbers]
        for roll in new_rolls:
            next_row = len(current_roll_numbers) + 2
            sheet.update_cell(next_row, 1, roll)
            current_roll_numbers.append(roll)

        # Update attendance status
        cell_updates = []
        for idx, roll in enumerate(current_roll_numbers, start=2):
            status = "Present" if roll in present_students else "Absent"
            cell_updates.append(Cell(row=idx, col=date_column, value=status))

        if cell_updates:
            sheet.update_cells(cell_updates, value_input_option='USER_ENTERED')

        # Apply cell formatting
        for idx, roll in enumerate(current_roll_numbers, start=2):
            status = "Present" if roll in present_students else "Absent"
            color = Color(1, 0, 0) if status == "Absent" else Color(0, 1, 0)
            cell_format = CellFormat(backgroundColor=color)
            format_cell_range(sheet, f"{chr(65 + date_column - 1)}{idx}", cell_format)

        print(f"Attendance updated for {id} in batch {batch} for {date}")
        send_mails(spreadsheet)
    except Exception as e:
        print(f"Error updating attendance: {e}")
        raise HTTPException(status_code=500, detail="Failed to update attendance")
    
def send_mails(spreadsheet):
    try:
        # Get the latest date column
        header_row = spreadsheet.sheet1.row_values(1)
        if len(header_row) < 2:
            print("No attendance dates found")
            return
        latest_date = header_row[-1]
        date_column_index = len(header_row)

        # Get all roll numbers and their attendance status for the latest date
        roll_numbers = spreadsheet.sheet1.col_values(1)[1:]  # Skip header
        attendance_status = spreadsheet.sheet1.col_values(date_column_index)[1:]  # Skip header

        # Find absent students and their emails
        absent_students = []
        for roll, status in zip(roll_numbers, attendance_status):
            if status.lower() == "absent":
                student = students.find_one({"roll": roll})
                if student and "Email" in student:
                    absent_students.append(student["Email"])

        if not absent_students:
            print("No absent students to notify")
            return

        # Email Configuration
        sender_email = os.getenv("SMTP_EMAIL")
        sender_password = os.getenv("SMTP_PASSWORD")
        smtp_server = os.getenv("SMTP_SERVER")
        smtp_port = os.getenv("SMTP_PORT")  # Changed to TLS port

        # Use TLS instead of SSL
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()  # Start TLS encryption
            server.login(sender_email, sender_password)
            
            for email in absent_students:
                try:
                    message = MIMEMultipart()
                    message["From"] = sender_email
                    message["To"] = email
                    message["Subject"] = "Attendance Notification"

                    body = f"Dear Student,\n\nYou were marked absent on {latest_date}. Please contact your teacher if this is incorrect.\n\nBest regards,\nXYZ"
                    message.attach(MIMEText(body, "plain"))

                    server.send_message(message)
                    print(f"Email sent to {email}")
                except Exception as email_error:
                    print(f"Error sending email to {email}: {email_error}")

        print(f"Emails sent to absent students for {latest_date}")
    except Exception as e:
        print(f"Error in email process: {e}")
                
                
@app.get("/getSpreadsheetUrl")
async def get_spreadsheet_url(teacher_id: str):
    try:
        teacher = teachers.find_one({"teacher_id": teacher_id})
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")

        spreadsheet_name = f"{teacher_id}_{teacher['name']}"
        spreadsheet = gsclient.open(spreadsheet_name)
        return {"url": spreadsheet.url , "teacher_id": teacher_id}
    except Exception as e:
        print(f"Error fetching spreadsheet URL: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch spreadsheet URL")