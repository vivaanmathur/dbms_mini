"""
The actual syllabus content that goes into the new tables.

Theory courses are written as   unit -> topic -> subtopic
Practical courses are written as a numbered list of experiments.
"""

# course_code -> list of units. Each unit is
# (unit_number, unit_title, planned_hours, [ (topic_title, [subtopics...]) ])
THEORY = {
    "DBMS": [
        (1, "Introduction to Database Systems", 8, [
            ("Database Concepts", ["File system versus DBMS",
                                   "Three schema architecture",
                                   "Data independence"]),
            ("Data Models", ["Hierarchical and network models",
                             "Relational model",
                             "Object oriented model"]),
        ]),
        (2, "Entity Relationship Modelling", 9, [
            ("ER Model", ["Entities and attributes",
                          "Relationships and cardinality",
                          "Weak entity sets"]),
            ("Extended ER", ["Generalisation and specialisation",
                             "Converting an ER diagram to tables"]),
        ]),
        (3, "Relational Model and SQL", 12, [
            ("Relational Algebra", ["Selection, projection and join",
                                    "Set operations",
                                    "Division operation"]),
            ("SQL", ["DDL commands",
                     "DML commands and simple queries",
                     "Joins and subqueries",
                     "Views and indexes"]),
        ]),
        (4, "Relational Database Design", 8, [
            ("Functional Dependencies", ["Armstrong's axioms",
                                         "Closure of attributes and keys"]),
            ("Normal Forms", ["1NF, 2NF and 3NF",
                              "BCNF",
                              "Decomposition and lossless join"]),
        ]),
        (5, "Transactions and Concurrency", 8, [
            ("Transactions", ["ACID properties", "States of a transaction"]),
            ("Concurrency Control", ["Lock based protocols",
                                     "Two phase locking",
                                     "Deadlock handling"]),
            ("Recovery", ["Log based recovery", "Checkpoints"]),
        ]),
    ],
    "DS1": [
        (1, "Introduction to Data Structures", 7, [
            ("Basics", ["Abstract data types",
                        "Time and space complexity",
                        "Asymptotic notation"]),
        ]),
        (2, "Arrays and Linked Lists", 10, [
            ("Arrays", ["One and two dimensional arrays", "Sparse matrices"]),
            ("Linked Lists", ["Singly linked list",
                              "Doubly linked list",
                              "Circular linked list"]),
        ]),
        (3, "Stacks and Queues", 9, [
            ("Stacks", ["Stack operations",
                        "Infix to postfix conversion",
                        "Recursion using stacks"]),
            ("Queues", ["Linear queue", "Circular queue", "Priority queue"]),
        ]),
        (4, "Trees", 10, [
            ("Binary Trees", ["Tree traversals",
                              "Binary search tree operations"]),
            ("Balanced Trees", ["AVL trees and rotations",
                                "Threaded binary trees"]),
        ]),
        (5, "Searching and Sorting", 9, [
            ("Searching", ["Linear search", "Binary search"]),
            ("Sorting", ["Bubble and selection sort",
                         "Insertion and shell sort",
                         "Quick and merge sort",
                         "Radix sort"]),
        ]),
    ],
    "OSC": [
        (1, "Introduction to Operating Systems", 7, [
            ("Operating System Basics", ["Functions of an operating system",
                                         "Types of operating systems",
                                         "System calls"]),
        ]),
        (2, "Process Management", 10, [
            ("Processes", ["Process states", "Process control block", "Threads"]),
            ("CPU Scheduling", ["FCFS and SJF",
                                "Round robin scheduling",
                                "Priority scheduling"]),
        ]),
        (3, "Synchronisation and Deadlock", 10, [
            ("Process Synchronisation", ["The critical section problem",
                                         "Semaphores",
                                         "Producer consumer problem"]),
            ("Deadlock", ["Necessary conditions",
                          "Banker's algorithm",
                          "Detection and recovery"]),
        ]),
        (4, "Memory Management", 10, [
            ("Main Memory", ["Contiguous allocation", "Paging", "Segmentation"]),
            ("Virtual Memory", ["Demand paging",
                                "Page replacement algorithms",
                                "Thrashing"]),
        ]),
        (5, "File Systems and I/O", 8, [
            ("File System", ["File allocation methods", "Directory structure"]),
            ("Disk Management", ["Disk scheduling algorithms"]),
        ]),
    ],
    "CNM": [
        (1, "Differential Calculus", 9, [
            ("Differentiation", ["Successive differentiation",
                                 "Taylor and Maclaurin series",
                                 "Indeterminate forms"]),
        ]),
        (2, "Partial Differentiation", 9, [
            ("Partial Derivatives", ["Partial differentiation",
                                     "Euler's theorem",
                                     "Maxima and minima of two variables"]),
        ]),
        (3, "Integral Calculus", 9, [
            ("Integration", ["Beta and gamma functions",
                             "Double and triple integrals",
                             "Applications of integration"]),
        ]),
        (4, "Numerical Solution of Equations", 9, [
            ("Roots of Equations", ["Bisection method",
                                    "Newton Raphson method",
                                    "Regula falsi method"]),
            ("Systems of Equations", ["Gauss elimination",
                                      "Gauss Seidel iteration"]),
        ]),
        (5, "Interpolation and Numerical Integration", 9, [
            ("Interpolation", ["Newton's forward and backward formulae",
                               "Lagrange's interpolation"]),
            ("Numerical Integration", ["Trapezoidal rule", "Simpson's rules"]),
        ]),
    ],
    "ESD": [
        (1, "Communication Skills", 7, [
            ("Communication", ["Verbal communication",
                               "Written communication",
                               "Presentation skills"]),
        ]),
        (2, "Aptitude and Reasoning", 7, [
            ("Aptitude", ["Quantitative aptitude", "Logical reasoning"]),
        ]),
        (3, "Career Readiness", 6, [
            ("Placement Preparation", ["Resume building",
                                       "Group discussion",
                                       "Interview skills"]),
        ]),
    ],
    "SCHIE": [
        (1, "Indian Knowledge Systems", 8, [
            ("Ancient Knowledge", ["Vedic literature",
                                   "Science in ancient India"]),
        ]),
        (2, "Art and Heritage", 7, [
            ("Indian Culture", ["Indian classical art forms",
                                "Architecture and heritage sites"]),
        ]),
        (3, "Philosophy and Values", 7, [
            ("Indian Thought", ["Schools of Indian philosophy",
                                "Ethics and values in modern life"]),
        ]),
    ],
    "UE1": [
        (1, "Foundations of the Elective", 15, [
            ("Introduction", ["Scope of the elective area", "Core concepts"]),
        ]),
        (2, "Applications", 15, [
            ("Applied Work", ["Case studies", "Mini project"]),
        ]),
    ],
}

# course_code -> list of experiment titles, in order
PRACTICAL = {
    "DBMSL": [
        "Draw an ER diagram and convert it to relational tables",
        "DDL commands - create, alter, drop",
        "DML commands and integrity constraints",
        "SQL queries using joins",
        "Subqueries, views and indexes",
        "PL/SQL blocks and stored procedures",
        "Cursors and triggers",
        "Normalisation case study up to BCNF",
        "Transactions, commit, rollback and savepoints",
        "Mini project - database with a front end",
    ],
    "OOPL": [
        "Classes, objects and member functions",
        "Constructors and destructors",
        "Function overloading and operator overloading",
        "Inheritance and its types",
        "Polymorphism and virtual functions",
        "Templates and generic programming",
        "Exception handling",
        "File handling",
        "Standard template library / collections",
        "Mini project using object oriented design",
    ],
    "DSL": [
        "Array operations and sparse matrix representation",
        "Singly linked list operations",
        "Doubly and circular linked lists",
        "Stack using array and using linked list",
        "Infix to postfix conversion and evaluation",
        "Linear queue and circular queue",
        "Binary search tree operations",
        "Binary tree traversals",
        "Comparison of sorting algorithms",
        "Searching techniques and hashing",
    ],
    "OSCL": [
        "Basic Linux commands",
        "Shell scripting",
        "Process creation using fork and exec",
        "CPU scheduling - FCFS and SJF",
        "CPU scheduling - round robin and priority",
        "Producer consumer problem using semaphores",
        "Banker's algorithm for deadlock avoidance",
        "Page replacement algorithms",
        "Disk scheduling algorithms",
        "Memory allocation strategies",
    ],
    "RIDE": [
        "Problem identification and definition",
        "Literature survey",
        "Design thinking and ideation",
        "Prototype development",
        "Project presentation and report",
    ],
}
