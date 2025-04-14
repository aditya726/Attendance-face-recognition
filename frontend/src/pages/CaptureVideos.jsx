import React, { useState, useRef, useEffect } from 'react';
import api from '../api';

const CaptureVideos = ({ route }) => {
  // State management
  const [recordingState, setRecordingState] = useState({
    isRecording: false,
    isRecorded: false,
    isUploading: false,
    uploadStatus: null // null | 'success' | 'error'
  });
  
  const [formData, setFormData] = useState({
    id: '',
    batch: ''
  });
  
  const [mediaState, setMediaState] = useState({
    videoUrl: null,
    videoBlob: null
  });
  
  // Refs
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunks = useRef([]);
  
  // Effect for handling recording state changes
  useEffect(() => {
    if (recordingState.isRecording) {
      startMediaRecording();
    } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      stopMediaRecording();
    }
  }, [recordingState.isRecording]);
  
  // Media recording functions
  const startMediaRecording = () => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        videoRef.current.srcObject = stream;
        
        mediaRecorderRef.current = new MediaRecorder(stream, {
          mimeType: 'video/mp4; codecs=avc1.42E01E, mp4a.40.2'
        });
        
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.current.push(event.data);
          }
        };
        
        mediaRecorderRef.current.onstop = () => {
          const blob = new Blob(chunks.current, { type: 'video/mp4' });
          const url = URL.createObjectURL(blob);
          
          setMediaState({
            videoUrl: url,
            videoBlob: blob
          });
          
          setRecordingState(prev => ({
            ...prev,
            isRecorded: true
          }));
          
          chunks.current = [];
        };
        
        mediaRecorderRef.current.start();
      })
      .catch(error => {
        console.error('Error accessing webcam: ', error);
        setRecordingState(prev => ({
          ...prev,
          isRecording: false
        }));
      });
  };
  
  const stopMediaRecording = () => {
    mediaRecorderRef.current.stop();
    videoRef.current.srcObject.getTracks().forEach(track => track.stop());
  };
  
  // Event handlers
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleStartRecording = () => {
    setRecordingState({
      isRecording: true,
      isRecorded: false,
      isUploading: false,
      uploadStatus: null
    });
  };
  
  const handleStopRecording = () => {
    setRecordingState(prev => ({
      ...prev,
      isRecording: false
    }));
  };
  
  const handleUpload = async () => {
    // Validation
    if (!formData.id || !formData.batch) {
      alert("Please enter both ID and Batch before uploading");
      return;
    }
    
    setRecordingState(prev => ({
      ...prev,
      isUploading: true
    }));
    
    // Prepare form data
    const data = new FormData();
    data.append('id', formData.id);
    data.append('batch', formData.batch);
    data.append('video', mediaState.videoBlob, 'video.mp4');
    
    try {
      const response = await api.post(route, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setRecordingState(prev => ({
        ...prev,
        isUploading: false,
        uploadStatus: response.status === 200 ? 'success' : 'error'
      }));
      if(response.status === 200){
        const res = await api.post("http://localhost:8000/flow/");
        console.log(res.data);
        if(res.status === 200)
            alert("processing attendance");
        else
            alert("failed");
      }
    } catch (error) {
      console.error('Upload error:', error);
      setRecordingState(prev => ({
        ...prev,
        isUploading: false,
        uploadStatus: 'error'
      }));
    }
  };
  
  const handleResetRecording = () => {
    setMediaState({
      videoUrl: null,
      videoBlob: null
    });
    
    setRecordingState(prev => ({
      ...prev,
      isRecorded: false,
      uploadStatus: null
    }));
  };
  
  // Status notification component
  const StatusNotification = () => {
    if (recordingState.uploadStatus === 'success') {
      return (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center">
          <div className="bg-green-100 p-2 rounded-full mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h4 className="text-green-800 font-medium">Upload Successful</h4>
            <p className="text-green-700 text-sm">Your video has been uploaded and is being processed.</p>
          </div>
        </div>
      );
    } else if (recordingState.uploadStatus === 'error') {
      return (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <div className="bg-red-100 p-2 rounded-full mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h4 className="text-red-800 font-medium">Upload Failed</h4>
            <p className="text-red-700 text-sm">Please try again or contact support if the issue persists.</p>
          </div>
        </div>
      );
    }
    
    return null;
  };
  
  // Main component render
  return (
    <div className="container mx-auto p-4 md:p-8 max-w-6xl">
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Video Capture Portal</h1>
          <p className="text-blue-100 mt-2">Securely record and upload video for processing</p>
        </div>
        
        {/* Main content */}
        <div className="p-4 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
            {/* Left column */}
            <div className="space-y-6">
              {/* User information form */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                  User Information
                </h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="userId">User ID</label>
                    <input
                      id="userId"
                      type="text"
                      name="id"
                      value={formData.id}
                      onChange={handleInputChange}
                      className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                      placeholder="Enter your ID"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="batchNumber">Batch Number</label>
                    <input
                      id="batchNumber"
                      type="text"
                      name="batch"
                      value={formData.batch}
                      onChange={handleInputChange}
                      className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                      placeholder="Enter your batch"
                      required
                    />
                  </div>
                </div>
              </div>
              
              {/* Recording area */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    <path d="M14 6a2 2 0 012-2h2a2 2 0 012 2v8a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
                  </svg>
                  Camera Feed
                </h2>
                
                <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden mb-4 shadow-inner">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                  ></video>
                  
                  {!recordingState.isRecording && !recordingState.isRecorded && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-white text-center p-4">
                        <div className="bg-black bg-opacity-40 p-4 rounded-lg backdrop-filter backdrop-blur-sm">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 text-white opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <p className="text-sm">Click the button below to start recording</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {recordingState.isRecording && (
                    <div className="absolute top-4 right-4 flex items-center bg-black bg-opacity-50 p-2 rounded-full">
                      <div className="h-3 w-3 bg-red-600 rounded-full mr-2 animate-pulse"></div>
                      <span className="text-white text-sm font-medium">REC</span>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-center">
                  {recordingState.isRecording ? (
                    <button
                      onClick={handleStopRecording}
                      className="px-5 py-3 bg-red-600 text-white font-medium rounded-lg shadow hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                      </svg>
                      Stop Recording
                    </button>
                  ) : (
                    <button
                      onClick={handleStartRecording}
                      disabled={recordingState.isUploading}
                      className={`px-5 py-3 bg-blue-600 text-white font-medium rounded-lg shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center ${recordingState.isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                      Start Recording
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {/* Right column */}
            <div>
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 h-full">
                <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                  </svg>
                  Preview & Upload
                </h2>
                
                {mediaState.videoUrl ? (
                  <div className="space-y-6">
                    <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden shadow-inner">
                      <video 
                        src={mediaState.videoUrl} 
                        controls 
                        className="w-full h-full"
                      ></video>
                    </div>
                    
                    <StatusNotification />
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        onClick={handleResetRecording}
                        disabled={recordingState.isUploading}
                        className={`px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors ${recordingState.isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        New Recording
                      </button>
                      
                      <button
                        onClick={handleUpload}
                        disabled={recordingState.isUploading || recordingState.uploadStatus === 'success'}
                        className={`px-4 py-3 bg-blue-600 text-white font-medium rounded-lg shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex justify-center items-center ${(recordingState.isUploading || recordingState.uploadStatus === 'success') ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {recordingState.isUploading ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Uploading...
                          </>
                        ) : recordingState.uploadStatus === 'success' ? (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Uploaded
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                            Upload Video
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                    <div className="text-center px-6 py-8">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                      </svg>
                      <h3 className="text-lg font-medium text-gray-600 mb-1">No Video Recorded</h3>
                      <p className="text-sm text-gray-500 max-w-xs">Your recorded video will appear here after you complete a recording</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Instructions or additional info */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 mt-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Important Information</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>Ensure you have proper lighting and a clear background when recording. The system will process your submission and you'll receive a confirmation once complete.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaptureVideos;