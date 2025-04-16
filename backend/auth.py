from datetime import datetime, timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from starlette import status
from passlib.context import CryptContext
from jose import jwt, JWTError
from dotenv import load_dotenv
from pymongo import MongoClient
import os 

load_dotenv()

route = APIRouter(
    prefix = '/auth',
    tags = ['auth']
)

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
# Token expiration time in minutes
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # You can adjust this value as needed

# MongoDB connection
MONGO_URI = os.getenv("mongo_uri")
client = MongoClient(MONGO_URI)
db = client["AttendanceSystem"]  # Using the same DB as main.py
teachers = db["teachers"]  # Using the same collection as main.py

# Password hashing and verification
pwd_context = CryptContext(schemes=["bcrypt"], deprecated = "auto")
ouath2_Bearer = OAuth2PasswordBearer(tokenUrl = 'auth/token')
    
class Token(BaseModel):
    access_token: str
    token_type: str 

class TeacherLogin(BaseModel):
    username: str
    password: str

# Helper functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# Teacher login endpoint moved from main.py
@route.post("/login", response_model=Token)
async def login_teacher(teacher: TeacherLogin):
    db_teacher = teachers.find_one({"name": teacher.username})
    if not db_teacher:
        raise HTTPException(status_code=400, detail="Invalid username")
    if not verify_password(teacher.password, db_teacher["password"]):
        raise HTTPException(status_code=400, detail="Invalid password")
    
    # Create a JWT token for teacher
    access_token = create_access_token(data={"sub": db_teacher["name"]})
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }

@route.get("/me")
async def get_current_user(token: Annotated[str, Depends(ouath2_Bearer)]):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user = teachers.find_one({"name": username})
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        return {"username": user["name"], "teacher_id": user["teacher_id"]}
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")